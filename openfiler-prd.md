# openfiler.ai — Product Requirements Document

*v0.3 — 2026-04-23*

> Architecture detail: `openfiler-architecture.md`
> UX design detail: `openfiler-ux.md`
> Build plan: `openfiler-build-plan.md`

---

## 1. Problem Statement

Filer is powerful but requires CLI fluency. Developers who would benefit most hit a friction wall before they see a single result. openfiler.ai removes that wall: paste a repo URL, get output in under 90 seconds. No install required.

---

## 2. Goals

| Goal | Metric |
|------|--------|
| Zero-install try-before-you-buy | First result < 90s from landing |
| Feature discoverability | All 5 capabilities reachable in one session |
| Conversion to CLI | `npx @filer/cli@latest` CTA after every output |
| Trust | Live output — users see exactly what Filer produces |
| Sustainability | LLM costs covered by users, not subsidised |

---

## 3. Access Model

Every feature is one of three tiers. This is the central product decision — all UX and architecture flows from it.

### Tier 0 — Open
No account, no key, rate-limited by IP only. Zero LLM cost.

| Feature | Why free |
|---------|----------|
| `filer pack` (no `--task`) | Static file scan + format |
| `filer secrets` | Secretlint static analysis |
| `filer export` | Reads committed `.filer/` nodes |

### Tier 1 — BYOK (Bring Your Own Key)
User supplies their LLM API key. We run the compute, they pay their provider directly. No markup. No account required.

| Feature | LLM used for |
|---------|-------------|
| `filer pack --task` | File relevance selection |
| `filer scan` | Security node extraction |
| `filer query` | Answer synthesis |

Key is AES-GCM encrypted in `localStorage`, never stored server-side. Sent as `X-LLM-Key` header over TLS only.

### Tier 2 — Hosted (paid, minimal markup)
We proxy LLM calls, user pays us at 20% over provider cost. Requires GitHub OAuth + payment method.

**Intentionally cheap:** sustainability, not margin.
- `filer scan` (50-file repo) ≈ $0.04
- `filer pack --task` ≈ $0.01–$0.03
- `filer query` ≈ $0.01

New accounts receive $1 credit on sign-up — no card required to try Hosted.

### Access flow

```
Land on site → choose feature
  │
  ├── Pack (no task) / Secrets / Export ──► Run immediately  [Tier 0]
  │
  └── Pack (task) / Scan / Query
        │
        ▼
     LLM needed
        ├── [Use my own key] ──► enter key → run             [Tier 1]
        └── [Use Hosted ~$0.0x] ──► sign in → run            [Tier 2]
```

---

## 4. User Personas

**Persona A — The Evaluator**
Evaluating Filer for their team. Hits Tier 0 first (Pack, Secrets), then tries Scan with their own key. Converts to CLI if output is valuable.

**Persona B — The Occasional User**
Uses the web for specific tasks weekly. Already has an Anthropic key. Prefers BYOK, no account needed.

**Persona C — The Team Lead**
Wants a shareable security report URL for stakeholders. Happy to pay $0.04 Hosted. Converts to Tier 2.

**Persona D — The Power User**
Already uses the CLI. Uses the web to share results. Tier 0 only.

---

## 5. Feature Scope — v1.0

Five modes. Each is a single config panel + output panel (no multi-step wizard — see UX doc).

### Mode 1 — Pack `FREE` + `BYOK`
Pack a repo into AI-ready context. Tier 0 by default; Tier 1/2 when `--task` is enabled.

**Inputs:** GitHub URL or zip upload, format (Markdown/XML/JSON), compress options, include/exclude patterns, token budget, git log/diff toggles, optional task description (triggers LLM).

**Outputs:** Packed content stream, token count, file count, download, copy, CLI command.

### Mode 2 — Secrets `FREE`
Static credential scan. Always Tier 0. Synchronous — no queue.

**Inputs:** GitHub URL or zip, optional scope path.

**Outputs:** Findings grouped by file, severity badges, line numbers, rule IDs, download JSON, CLI command.

### Mode 3 — Scan `BYOK`
Full LLM security report. Always requires LLM. Supports async queue for large repos.

**Inputs:** GitHub URL or zip, LLM key, scope, speed (standard/fast), fail-on severity.

**Outputs:** HTML report embedded + shareable URL (7-day TTL), severity summary, download, CLI command.

### Mode 4 — Export `FREE`
Read existing `.filer/` knowledge nodes. Tier 0. Synchronous.

**Inputs:** GitHub URL or zip (must have `.filer/`), type filter, scope, verified-only toggle, format.

**Outputs:** Rendered knowledge nodes by type and scope, download Markdown/JSON, CLI command.

### Mode 5 — Query `BYOK`
Natural language question over `.filer/` nodes with LLM synthesis. Supports async queue.

**Inputs:** GitHub URL or zip (must have `.filer/`), LLM key, question text, optional type/scope filters.

**Outputs:** Synthesised answer, supporting nodes cited, copy, CLI command.

---

## 6. Out of Scope — v1.0

| Feature | Reason |
|---------|--------|
| `filer learn` | Requires GitHub OAuth write access on source repo |
| `filer agent` | Stateful, long-running — incompatible with stateless web |
| `filer review` | Requires persistent human-in-the-loop session |
| Private repos | v2 — requires GitHub OAuth repo scope |
| Saved history / dashboards | v2 |
| Multi-provider Hosted | v2 — Anthropic only for Hosted in v1 |

---

## 7. Security Requirements

Security is the highest priority constraint. Every layer must enforce it.

### Input validation (all modes)
- Repo URL must match `^https://github\.com/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$` — no other git hosts, no bare paths, no query strings
- Zip uploads: max 10MB, content-type `application/zip` only, zip-slip path traversal check on every entry before extraction
- Question text (Query mode): max 500 chars, stripped of HTML
- Scope path: must be a relative path, no `..` segments

### API key security
- Never logged, never stored plain-text anywhere
- Browser: AES-GCM encrypted in `localStorage`, decryption key in `sessionStorage` (cleared on tab close)
- Transit browser→API: `X-LLM-Key` header over TLS 1.3 only
- Transit API→worker (async jobs): AES-256-GCM with `WORKER_TRANSIT_SECRET`, deleted from job record on completion
- Server-side: SHA-256 hash stored only for rate-limit auditing, 30-day retention

### Rate limiting — layered defence
- Layer 1: Vercel edge middleware (before any DB or compute) — IP-based, in-memory sliding window
- Layer 2: DB rate limit table — keyed by `hash(key_hash|ip + hour)` for BYOK, `hash(ip + hour)` for Tier 0

Limits: Tier 0 = 10 jobs/IP/hour, BYOK = 30/IP/hour, Hosted = metered (no hard limit).

### Git clone hardening
- Only `https://github.com` URLs accepted (validated before any shell operation)
- Clone flags: `--depth 1 --no-tags --single-branch --no-recurse-submodules`
- Resource limits: 50MB disk quota, 30s clone timeout, killed with SIGKILL on timeout
- No code execution from cloned repo — pipeline reads files only
- Tmp dir always deleted in `finally` block, even on crash

### Infrastructure
- All API routes: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict CSP
- CSP `connect-src` whitelist: only known LLM provider domains
- Worker Express endpoint: no public routes except `GET /reports/:id` and `GET /health`
- Report HTML is served as static content — no script execution, `Content-Security-Policy: default-src 'none'` on report responses

---

## 8. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Time to first result (Tier 0) | < 10s for repos under 50 files |
| Time to first result (Tier 1, small repo) | < 30s |
| Async job completion (large repos) | < 5 minutes |
| Availability | 99.5% uptime |
| Max repo size | 50MB post-clone |
| Max concurrent async jobs | 4 (single worker, scale horizontally) |
| Report URL availability | 7 days from creation |

---

## 9. Resolved Design Decisions

| Question | Decision |
|----------|----------|
| BYOK key persistence | `localStorage` + `sessionStorage` session-bound encryption. Cleared on tab close. No server storage. |
| Report storage | Postgres `TEXT` column, served by Railway worker Express endpoint. No object storage needed at v1 scale. |
| Job queue | pg-boss on Railway Postgres — reuses existing DB, zero new infra |
| Async worker host | Railway (same project as Postgres) |
| Multi-step wizard vs single panel | Single config panel — no wizard steps (see UX doc) |
| Hosted provider | Anthropic only in v1 |
| Free Hosted credits | $1 on sign-up, no card required to claim |
| GitHub PAT for size pre-flight | Fine-grained PAT, read-only `Contents` permission on public repos |

---

## 10. Success Metrics

| Metric | Month 1 Target |
|--------|---------------|
| Weekly active sessions | 500 |
| Tier 0 completions/week | 300 |
| BYOK activations/week | 50 |
| Tier 2 sign-ups/month | 20 |
| Tier 2 MRR | $50 |
| CLI CTA click-through | 15% of completions |
