# openfiler.ai — Architecture & Design Document

*v0.4 — 2026-04-23*

> Requirements: `openfiler-prd.md`
> UX design: `openfiler-ux.md`
> Build plan: `openfiler-build-plan.md`

---

## 1. Infrastructure Summary

| Concern | Service | Notes |
|---------|---------|-------|
| Frontend + API routes | Vercel Pro | Next.js App Router, global CDN, 60s function timeout |
| Postgres | Railway | Job queue (pg-boss), usage ledger, reports, users |
| Async worker | Railway | Same project as Postgres; no timeout constraints |
| Report serving | Railway worker | Express `GET /reports/:id` — HTML from Postgres |
| Auth | NextAuth.js + GitHub OAuth | MIT, no vendor lock-in |
| Payments | Stripe Metered Billing | Per-job usage, 20% markup |

**No Cloudflare. No object storage. No Redis. Two platforms: Vercel + Railway.**

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ Config Panel │  │ LLMKeyManager    │  │ OutputPanel (SSE)        │  │
│  │ (React)      │  │ AES-GCM in       │  │ inline or async stream   │  │
│  │              │  │ localStorage     │  │                          │  │
│  └──────┬───────┘  └────────┬─────────┘  └──────────────────────────┘  │
└─────────┼───────────────────┼────────────────────────────────────────────┘
          │ HTTPS/TLS 1.3      │ X-LLM-Key header only (never in body/URL)
          ▼                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  VERCEL — Next.js Route Handlers                                         │
│                                                                          │
│  middleware.ts   ← edge rate limit (Layer 1) + security headers          │
│                                                                          │
│  POST /api/jobs            ← all LLM jobs (pack+task, scan, query)      │
│  GET  /api/jobs/:id/stream ← SSE relay via pg NOTIFY                    │
│  GET  /api/jobs/:id        ← poll status                                 │
│  POST /api/secrets         ← inline Tier 0 (sync, no queue)             │
│  POST /api/export          ← inline Tier 0 (sync, no queue)             │
│  POST /api/pack            ← inline Tier 0 pack (no task, no queue)     │
│  GET  /api/auth/[...]      ← NextAuth.js                                │
│  POST /api/billing/webhook ← Stripe                                     │
│  GET  /api/health          ← uptime check                               │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Job Router  (inside POST /api/jobs)                             │   │
│  │                                                                  │   │
│  │  1. Validate URL (regex + allowlist)                             │   │
│  │  2. estimateJobSize() via GitHub API                             │   │
│  │  3. small (≤30 modules, ≤10MB) → inline streaming               │   │
│  │     large (>30 modules, >10MB) → enqueue to pg-boss             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
                    │ DATABASE_URL          │ inline jobs
                    │ (Railway Postgres)    │ clone + run here
                    ▼                       ▼
┌──────────────────────────────────┐    LLM Provider
│  RAILWAY PROJECT: openfiler      │    (BYOK key or Hosted)
│                                  │
│  ┌─────────────┐ ┌─────────────┐ │
│  │  Postgres   │ │  Worker     │ │
│  │             │ │  (Node.js)  │ │
│  │  pgboss.*   │ │             │ │
│  │  users      │◄│  pg-boss    │ │
│  │  usage_     │ │  teamSize:4 │ │
│  │  events     │ │             │ │
│  │  reports    │ │  Express:   │ │
│  │  rate_      │ │  GET        │ │
│  │  limits     │ │  /reports/  │ │
│  │             │ │  :id        │ │
│  │             │ │  GET /health│ │
│  └─────────────┘ └─────────────┘ │
└──────────────────────────────────┘
```

---

## 3. Critical Dependency: `@filer/cli` Library Export

**This is Phase 0 — nothing else builds until it exists.**

The web app imports Filer's pipeline functions directly. This requires a `/lib` export in the CLI's `package.json`. The CLI does not currently have this export.

### Required changes to `@filer/cli`

**`package.json`:**
```json
{
  "exports": {
    ".":     "./dist/cli.js",
    "./lib": "./dist/lib/index.js"
  }
}
```

**`src/lib/index.ts`** (new file — public API surface):
```typescript
// Pack
export { packFiles }         from '../pack/scanner.js';
export { formatOutput }      from '../pack/formatter.js';
export { annotateFile }      from '../pack/annotator.js';
export { selectRelevantFiles } from '../pack/selector.js';
export { compress }          from '../pack/compressor.js';

// Security
export { scanForSecrets, findingsToSecurityNodes } from '../security/secretlint.js';

// Knowledge layer
export { runIndex }          from '../pipeline/indexer.js';
export { readAllNodes }      from '../store/mod.js';

// Query + export (new thin wrappers needed — see below)
export { queryNodes }        from '../lib/query.js';   // NEW
export { exportNodes }       from '../lib/export.js';  // NEW
```

**`src/lib/query.ts`** (new — thin wrapper over existing query logic):
```typescript
import { readAllNodes }  from '../store/mod.js';
import { LLMGateway }    from '../llm/mod.js';
import type { AnyNode }  from '../schema/mod.js';

export interface QueryResult {
  answer:   string;
  nodes:    AnyNode[];
  tokens:   number;
}

export async function queryNodes(
  root:     string,
  question: string,
  gateway:  LLMGateway,
  opts?:    { types?: string[]; scope?: string }
): Promise<QueryResult> { ... }
```

**`src/lib/export.ts`** (new — thin wrapper):
```typescript
export async function exportNodes(
  root:  string,
  opts?: { types?: string[]; scope?: string; verified?: boolean; format?: 'markdown' | 'json' }
): Promise<string> { ... }
```

### Version pinning strategy

The web app pins an exact version of `@filer/cli` in `worker/package.json` and `package.json`. Updates are intentional — not automatic. A GitHub Actions workflow in `openfiler-web` runs on new `@filer/cli` releases and opens a PR with the version bump, running integration tests against it.

```json
// openfiler-web/package.json
"dependencies": {
  "@filer/cli": "1.2.0"   // pinned — bump via PR only
}
```

---

## 4. Security Architecture

Security is enforced in layers. Each layer is independent — a failure in one does not bypass the others.

### 4.1 Layer 1 — Edge rate limiting (Vercel middleware)

Runs before any Route Handler, before any DB call. Uses in-memory sliding window at the Vercel edge. Never hits Railway for rate-limit decisions.

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function middleware(req: NextRequest) {
  // Security headers on every response
  const res = NextResponse.next();
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +   // needed for Next.js hydration
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https://api.anthropic.com https://api.openai.com https://api.moonshot.cn; " +
    "frame-src 'none'; " +
    "object-src 'none'"
  );

  // Rate limiting on API routes only
  if (!req.nextUrl.pathname.startsWith('/api/')) return res;
  if (req.nextUrl.pathname.startsWith('/api/auth')) return res; // NextAuth handles its own

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const tier = req.headers.get('x-llm-key') ? 'byok'
    : req.headers.get('authorization') ? 'hosted' : 'open';
  const limit = tier === 'byok' ? 30 : tier === 'hosted' ? 999 : 10;

  const key = `${tier}:${ip}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 3_600_000 });
  } else {
    entry.count++;
    if (entry.count > limit) {
      return new NextResponse(
        JSON.stringify({ error: 'Rate limit exceeded', retryAfter: Math.ceil((entry.resetAt - now) / 1000) }),
        { status: 429, headers: { 'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)) } }
      );
    }
  }
  return res;
}

export const config = { matcher: '/api/:path*' };
```

### 4.2 Layer 2 — Input validation

Every API route validates inputs before any computation:

```typescript
// lib/validators.ts

const GITHUB_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/;

export function validateRepoUrl(url: string): void {
  if (!GITHUB_URL_RE.test(url)) {
    throw new ValidationError('Only public GitHub URLs are supported (https://github.com/owner/repo)');
  }
}

export function validateZipUpload(buf: Buffer, sizeBytes: number): void {
  if (sizeBytes > 10 * 1024 * 1024) throw new ValidationError('Upload exceeds 10MB limit');
  if (!isZipMagicBytes(buf)) throw new ValidationError('File must be a zip archive');
}

export function validateZipEntries(entries: ZipEntry[]): void {
  for (const entry of entries) {
    // Zip slip prevention — no absolute paths, no path traversal
    if (path.isAbsolute(entry.name) || entry.name.includes('..')) {
      throw new ValidationError(`Unsafe zip entry path: ${entry.name}`);
    }
  }
}

export function validateQuestion(q: string): string {
  if (q.length > 500) throw new ValidationError('Question exceeds 500 character limit');
  return q.replace(/<[^>]*>/g, '');  // strip HTML tags
}

export function validateScope(scope: string): void {
  if (scope && (path.isAbsolute(scope) || scope.includes('..'))) {
    throw new ValidationError('Scope must be a relative path with no traversal');
  }
}
```

### 4.3 Layer 3 — Git clone hardening

```typescript
// lib/git-clone.ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);
const CLONE_TIMEOUT_MS = 30_000;
const MAX_CLONE_BYTES  = 50 * 1024 * 1024;  // 50MB

export async function cloneRepo(url: string, branch?: string): Promise<string> {
  // URL already validated by validateRepoUrl() before this is called
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'of-'));

  const args = [
    'clone',
    '--depth', '1',
    '--single-branch',
    '--no-tags',
    '--no-recurse-submodules',
    '--filter=blob:limit=500k',  // skip files >500KB during clone
    ...(branch ? ['--branch', branch] : []),
    url,
    tmpDir,
  ];

  try {
    await execFileAsync('git', args, {
      timeout: CLONE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',  // never prompt for credentials
        HOME: tmpDir,              // isolate git config
      },
    });
  } catch (err: any) {
    await rm(tmpDir, { recursive: true, force: true });
    if (err.killed) throw new Error('Repository clone timed out (30s)');
    throw new Error(`Failed to clone repository: ${sanitizeGitError(err.stderr)}`);
  }

  // Verify size after clone
  const sizeMb = await getDirSizeMb(tmpDir);
  if (sizeMb * 1024 * 1024 > MAX_CLONE_BYTES) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error('Repository exceeds 50MB size limit');
  }

  return tmpDir;
}

function sanitizeGitError(stderr: string): string {
  // Never expose internal paths or credentials in error messages
  return (stderr ?? '').split('\n').slice(0, 3).join(' ').slice(0, 200);
}
```

### 4.4 Layer 4 — API key security

**Browser storage:**
```typescript
// lib/keystore.ts (browser only — never imported server-side)
const STORAGE_KEY = 'of_llm_key';

async function deriveEncryptionKey(): Promise<CryptoKey> {
  let sessionSecret = sessionStorage.getItem('of_ss');
  if (!sessionSecret) {
    sessionSecret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    sessionStorage.setItem('of_ss', sessionSecret);
  }
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(sessionSecret), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode('openfiler-v1'), iterations: 100_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export async function storeKey(rawKey: string): Promise<void> {
  const encKey = await deriveEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, new TextEncoder().encode(rawKey));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    iv:   btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(enc))),
  }));
}

export async function retrieveKey(): Promise<string | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const { iv, data } = JSON.parse(raw);
    const encKey = await deriveEncryptionKey();
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)) },
      encKey, Uint8Array.from(atob(data), c => c.charCodeAt(0))
    );
    return new TextDecoder().decode(dec);
  } catch { return null; }
}

export function clearKey(): void {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem('of_ss');
}
```

**Server-side key audit hash (rate-limit only):**
```typescript
// lib/key-audit.ts (server only)
import { createHash } from 'crypto';
export const hashKey = (k: string) =>
  createHash('sha256').update('openfiler-audit-v1:' + k).digest('hex');
```

**Worker transit encryption:**
```typescript
// lib/key-transit.ts (shared — server + worker)
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
const ALG = 'aes-256-gcm';

export function encryptForWorker(raw: string): string {
  const secret = Buffer.from(process.env.WORKER_TRANSIT_SECRET!, 'hex');
  const iv     = randomBytes(12);
  const c      = createCipheriv(ALG, secret, iv);
  const enc    = Buffer.concat([c.update(raw, 'utf8'), c.final()]);
  return JSON.stringify({ iv: iv.toString('hex'), tag: c.getAuthTag().toString('hex'), enc: enc.toString('hex') });
}

export function decryptFromApi(payload: string): string {
  const { iv, tag, enc } = JSON.parse(payload);
  const secret = Buffer.from(process.env.WORKER_TRANSIT_SECRET!, 'hex');
  const d = createDecipheriv(ALG, secret, Buffer.from(iv, 'hex'));
  d.setAuthTag(Buffer.from(tag, 'hex'));
  return d.update(Buffer.from(enc, 'hex')).toString('utf8') + d.final('utf8');
}
```

**Key lifecycle summary:**

| Stage | Form | Location | Lifetime |
|-------|------|----------|----------|
| Browser at rest | AES-GCM ciphertext | `localStorage` | Until tab close or clear |
| Browser → Vercel | Plaintext over TLS 1.3 | Memory only | Request duration |
| Vercel → Railway (async) | AES-GCM ciphertext | Postgres job row | Until job completes, then deleted |
| Inside worker | Plaintext | Memory only | Job duration |
| Rate-limit audit | SHA-256 hash | Postgres | 30 days |
| Raw key | **Never stored** | — | — |

### 4.5 Layer 5 — Report security

Reports are HTML generated by `@filer/cli`. When served, they must not be able to execute scripts in the serving context.

```typescript
// worker/index.ts — report serving
app.get('/reports/:id', async (req, res) => {
  const report = await db.selectFrom('reports')
    .select('html')
    .where('id', '=', req.params.id)
    .where('expires_at', '>', new Date())
    .executeTakeFirst();

  if (!report) return res.status(404).send('Not found');

  // Serve with locked-down CSP — report HTML must not execute scripts
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
  res.send(report.html);
});
```

### 4.6 CORS policy

Vercel API routes accept requests from `https://openfiler.ai` only. The worker Express endpoint accepts requests from Vercel only (not the browser directly).

```typescript
// worker/index.ts
app.use((req, res, next) => {
  const allowed = process.env.VERCEL_URL ?? 'https://openfiler.ai';
  if (req.path.startsWith('/reports/') || req.path === '/health') return next(); // public
  if (req.headers.origin !== allowed) return res.status(403).json({ error: 'Forbidden' });
  next();
});
```

---

## 5. Job Routing — Option C (Hybrid)

### 5.1 Size pre-flight

```typescript
// lib/job-sizer.ts
export async function estimateJobSize(url: string): Promise<{ modules: number; sizeMb: number }> {
  const { owner, repo } = parseGitHubUrl(url);
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    { headers: { Authorization: `Bearer ${process.env.GITHUB_PAT}` } }
  );
  if (!res.ok) return { modules: 99, sizeMb: 99 };  // fail safe: route to async
  const { tree } = await res.json();
  const files = (tree as any[]).filter(f => f.type === 'blob' && isSourceFile(f.path));
  const bytes = files.reduce((s, f) => s + (f.size ?? 0), 0);
  return { modules: Math.ceil(files.length / 8), sizeMb: bytes / 1e6 };
}

export const shouldEnqueue = (e: { modules: number; sizeMb: number }) =>
  e.modules > 30 || e.sizeMb > 10;
```

`GITHUB_PAT` must be a fine-grained token with read-only `Contents` permission on public repos. Unauthenticated GitHub API calls are limited to 60/hour — insufficient for production.

### 5.2 Inline path (Vercel — small jobs)

```typescript
// Runs inside Vercel function, streams SSE as response body
async function handleInline(spec: JobSpec, llmKey: string | null): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = new SSEWriter(writable);
  runJob(spec, llmKey, writer)
    .catch(e => writer.sendError(e.message))
    .finally(() => writer.close());
  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
```

### 5.3 Async path (Railway worker — large jobs)

```typescript
// Vercel: enqueue and return jobId
async function handleAsync(spec: JobSpec, llmKey: string | null): Promise<Response> {
  const encrypted = llmKey ? encryptForWorker(llmKey) : null;
  const jobId = await jobStore.enqueue({ spec, llmKeyEncrypted: encrypted });
  return Response.json({ jobId, stream: `/api/jobs/${jobId}/stream` });
}

// Vercel: SSE relay — subscribes to pg NOTIFY, replays missed events
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { readable, writable } = new TransformStream();
  const writer = new SSEWriter(writable);

  const past = await jobStore.getEvents(params.id);
  past.forEach(e => writer.send(e));

  if (!past.find(e => e.type === 'complete' || e.type === 'error')) {
    jobStore.subscribe(params.id, e => {
      writer.send(e);
      if (e.type === 'complete' || e.type === 'error') writer.close();
    });
  } else {
    writer.close();
  }

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
```

### 5.4 Client — transparent to both paths

```typescript
// lib/job-client.ts (browser)
export async function submitJob(spec: JobSpec, onEvent: (e: SSEEvent) => void): Promise<void> {
  const key = await retrieveKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['X-LLM-Key'] = key;

  const res = await fetch('/api/jobs', { method: 'POST', headers, body: JSON.stringify(spec) });

  if (res.headers.get('Content-Type')?.includes('text/event-stream')) {
    await consumeSSE(res.body!, onEvent);
  } else {
    const { stream } = await res.json();
    await consumeSSE((await fetch(stream)).body!, onEvent);
  }
}
```

### 5.5 Job state machine

```
queued → running → completed
                 ↘ failed
                 ↘ timeout (300s hard kill, partial result saved)
```

---

## 6. Railway Worker

### 6.1 Worker services (one Railway project, two services)

```
openfiler (Railway project)
├── postgres   ← Railway-managed Postgres
└── worker     ← deployed from openfiler-web/worker/
               ← DATABASE_URL auto-injected from postgres service
```

### 6.2 Worker process

```typescript
// worker/index.ts
import PgBoss  from 'pg-boss';
import express from 'express';
import { runJob } from '@filer/cli/lib';

const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, noScheduling: true });
await boss.start();

boss.work('filer-job', { teamSize: 4, teamConcurrency: 4 }, async (job) => {
  const { spec, llmKeyEncrypted } = job.data as JobData;
  const llmKey = llmKeyEncrypted ? decryptFromApi(llmKeyEncrypted) : null;
  const pub    = new PgNotifyPublisher(job.id);

  try {
    const meta = await runJob(spec, llmKey, pub);
    if (spec.mode === 'scan' && meta.reportHtml) {
      await db.insertInto('reports').values({
        id:         job.id,
        html:       meta.reportHtml,
        repo_url:   spec.source.url ?? null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).execute();
      meta.reportUrl = `${process.env.WORKER_PUBLIC_URL}/reports/${job.id}`;
      // Delete transit key immediately
      await db.updateTable('pgboss.job')
        .set(eb => ({ data: eb.fn('jsonb_set', ['data', eb.val('{llmKeyEncrypted}'), eb.val('null')]) }))
        .where('id', '=', job.id).execute();
    }
    await pub.send({ type: 'complete', meta });
    await recordUsage(job.id, spec, meta);
  } catch (err: any) {
    await pub.send({ type: 'error', message: err.message });
  }
});

// ── Report serving ──────────────────────────────────────────────────
const app = express();

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

app.get('/reports/:id', async (req, res) => {
  const report = await db.selectFrom('reports').select('html')
    .where('id', '=', req.params.id)
    .where('expires_at', '>', new Date())
    .executeTakeFirst();

  if (!report) return res.status(404).send('Not found');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
  res.send(report.html);
});

app.listen(process.env.PORT ?? 3001);
```

### 6.3 Worker health monitoring

Railway restarts the worker on crash. The `/health` endpoint is polled by:
- Railway's built-in health check (configured in `railway.toml`)
- An external uptime monitor (Better Uptime free tier or similar)

```toml
# worker/railway.toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 10
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### 6.4 Report expiry cleanup

pg-boss scheduled job (runs nightly inside the worker — no Vercel Cron needed):

```typescript
await boss.schedule('cleanup-reports', '0 2 * * *', {});
boss.work('cleanup-reports', async () => {
  await db.deleteFrom('reports').where('expires_at', '<', new Date()).execute();
});
```

---

## 7. Data Model

```sql
-- Railway Postgres
-- pg-boss creates pgboss.* schema automatically on boss.start()

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id           TEXT UNIQUE NOT NULL,
  github_login        TEXT NOT NULL,
  email               TEXT,
  stripe_customer_id  TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usage_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),   -- NULL for BYOK
  key_hash        TEXT,                         -- SHA-256 hash (BYOK only)
  job_id          TEXT,                         -- pg-boss job ID (async path)
  mode            TEXT NOT NULL,                -- pack|scan|secrets|export|query
  path            TEXT,                         -- inline|async
  repo_url        TEXT,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  provider        TEXT,
  model           TEXT,
  cost_usd        NUMERIC(10,6),
  billed_usd      NUMERIC(10,6),               -- with 20% markup, Tier 2 only
  duration_ms     INTEGER,
  status          TEXT DEFAULT 'completed',     -- completed|failed|timeout
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rate_limits (
  bucket_key    TEXT PRIMARY KEY,              -- hash(tier:ip:hour)
  count         INTEGER DEFAULT 0,
  window_start  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),       -- NULL for anonymous BYOK
  key_hash    TEXT,
  html        TEXT NOT NULL,                   -- ~50–150KB HTML
  repo_url    TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON usage_events (user_id, created_at);
CREATE INDEX ON usage_events (key_hash, created_at);
CREATE INDEX ON reports (expires_at);
```

### Database migrations

Managed with [Kysely Migrations](https://kysely.dev/docs/migrations). Migrations run automatically on Vercel build (`npm run db:migrate` in build script) and on worker startup. Migration files live in `db/migrations/`.

```typescript
// db/migrations/001_initial.ts
import { Kysely, sql } from 'kysely';
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable('users')...
}
```

---

## 8. API Contract

### POST /api/jobs (LLM features)

```typescript
// Request body
interface JobRequest {
  mode:    'pack' | 'scan' | 'query';
  source:  GitHubSource | UploadSource;
  options: ModeOptions;
  tier:    'byok' | 'hosted';
}
// Header: X-LLM-Key (BYOK only, TLS only)

// Response: SSE stream (inline) or JSON (async)
// SSE stream:
type SSEEvent =
  | { type: 'progress'; message: string; pct: number }
  | { type: 'chunk';    content: string }
  | { type: 'complete'; meta: JobMeta }
  | { type: 'error';    message: string; code: string };

interface JobMeta {
  tokens:      number;
  files:       number;
  durationMs:  number;
  costUsd?:    number;
  reportUrl?:  string;    // scan mode only
  cliCommand:  string;    // exact CLI command producing same result
}

// Async response JSON:
{ jobId: string; stream: string }  // stream = /api/jobs/:id/stream
```

### POST /api/secrets, /api/export, /api/pack (Tier 0)

Synchronous. Return JSON directly (no SSE, no queue).

```typescript
// /api/secrets response
{ findings: SecretFinding[]; fileCount: number; durationMs: number; cliCommand: string }

// /api/export response
{ content: string; nodeCount: number; durationMs: number; cliCommand: string }

// /api/pack response — streaming SSE (same as jobs, inline path only)
```

---

## 9. Repository Structure

```
openfiler-web/
├── app/
│   ├── page.tsx                    ← landing page
│   ├── (modes)/
│   │   ├── pack/page.tsx
│   │   ├── secrets/page.tsx
│   │   ├── scan/page.tsx
│   │   ├── export/page.tsx
│   │   └── query/page.tsx
│   ├── report/[id]/page.tsx        ← redirects to worker report URL
│   ├── account/page.tsx
│   └── api/
│       ├── jobs/route.ts
│       ├── jobs/[id]/route.ts
│       ├── jobs/[id]/stream/route.ts
│       ├── pack/route.ts           ← Tier 0 pack (no task)
│       ├── secrets/route.ts
│       ├── export/route.ts
│       ├── health/route.ts
│       └── auth/[...nextauth]/route.ts
├── worker/
│   ├── index.ts                    ← pg-boss + Express
│   ├── Dockerfile
│   ├── railway.toml
│   └── package.json                ← @filer/cli pinned
├── components/
│   ├── ModeLayout.tsx              ← config panel + output panel shell
│   ├── SourceInput.tsx
│   ├── LLMKeyPrompt.tsx
│   ├── OutputPanel.tsx
│   ├── JobSizeWarning.tsx
│   ├── CostEstimate.tsx
│   ├── SeverityBadge.tsx
│   ├── NodeCard.tsx
│   └── CliHandoff.tsx
├── lib/
│   ├── keystore.ts                 ← browser only
│   ├── job-client.ts               ← browser only
│   ├── job-router.ts               ← server
│   ├── job-runner.ts               ← server
│   ├── job-store.ts                ← server (pg-boss wrapper)
│   ├── git-clone.ts                ← server
│   ├── key-audit.ts                ← server
│   ├── key-transit.ts              ← server + worker (shared)
│   ├── validators.ts               ← server
│   ├── sse-writer.ts               ← server
│   └── db.ts                       ← server + worker
├── db/
│   └── migrations/
│       └── 001_initial.ts
├── middleware.ts                   ← edge rate limit + security headers
└── package.json
```

---

## 10. Environment Variables

```bash
# Vercel
NEXTAUTH_SECRET=<32 random bytes, hex>
NEXTAUTH_URL=https://openfiler.ai
GITHUB_CLIENT_ID=<OAuth app>
GITHUB_CLIENT_SECRET=<OAuth app>
GITHUB_PAT=<fine-grained PAT, public repo read-only Contents>
ANTHROPIC_API_KEY=<Hosted tier key>
DATABASE_URL=<Railway Postgres URL>
WORKER_TRANSIT_SECRET=<64 hex chars = 256-bit random>
WORKER_PUBLIC_URL=https://worker.openfiler.ai
STRIPE_SECRET_KEY=<key>
STRIPE_WEBHOOK_SECRET=<key>
NEXT_PUBLIC_WORKER_URL=https://worker.openfiler.ai  # client-visible

# Railway worker
DATABASE_URL=${{Postgres.DATABASE_URL}}             # Railway reference
WORKER_TRANSIT_SECRET=<same as Vercel>
ANTHROPIC_API_KEY=<same as Vercel>
WORKER_PUBLIC_URL=https://worker.openfiler.ai
PORT=3001
```

---

## 11. Scalability Notes

| Bottleneck | Current ceiling | Scale path |
|------------|----------------|------------|
| Async job concurrency | 4 (single worker, `teamSize: 4`) | Add Railway worker instances; pg-boss handles multi-worker via `SKIP LOCKED` |
| Inline job concurrency | Vercel serverless (auto-scales) | No action needed |
| Postgres connections | Railway starter: 25 connections | Add pgBouncer (Railway offers this); or upgrade plan |
| Report storage | Postgres TEXT column | At scale (>100K reports/month), migrate to R2 — API contract unchanged |
| Git clone disk | Vercel: ephemeral `/tmp` (~512MB) | Each inline job uses ~50MB max; parallel inline jobs each get their own function instance |
| Rate limiting | Edge in-memory map | Replaces with Upstash Ratelimit at scale (drop-in swap in `middleware.ts`) |

---

## 12. Open Questions

1. **Worker Railway URL → custom domain**: Railway-assigned URL is used until `worker.openfiler.ai` is configured (tomorrow). Reports generated before the cutover will have broken URLs — acceptable since no users yet. Add 301 redirect on custom domain go-live.

2. **Worker scaling**: pg-boss `teamSize: 4` on one instance. Railway supports horizontal scaling — add second instance when p95 queue depth consistently exceeds 4.

3. **Vercel inline job disk**: Vercel `/tmp` is 512MB shared across all concurrent function invocations on the same instance. Monitor for disk pressure on inline pack jobs for large repos.
