# openfiler.ai — Build Plan

*v0.1 — 2026-04-23*

> Each phase ships to production before the next phase begins.
> Every phase is independently deployable and adds real user value.
> No phase requires rewiring a previous one.

---

## Dependency Map

```
Phase 0 (Foundation)
    │
    ├── Phase 1 (Secrets)    ← first live feature, validates infra
    │       │
    │       └── Phase 2 (Pack Tier 0)
    │               │
    │               └── Phase 3 (Export)
    │                       │
    │                       └── Phase 4 (Async infrastructure)
    │                               │
    │                               ├── Phase 5 (Scan + BYOK)
    │                               │
    │                               └── Phase 6 (Query + BYOK)
    │                                       │
    │                                       └── Phase 7 (Pack --task BYOK)
    │                                               │
    │                                               └── Phase 8 (Hosted + Auth + Billing)
    │                                                       │
    │                                                       └── Phase 9 (Landing + Launch)
```

---

## Phase 0 — Foundation
**Goal:** Infrastructure running, all env vars set, CI/CD wired, `@filer/cli/lib` export exists.
**Nothing user-facing ships. This phase is the only one with no deployable output — do it once, fast.**

### 0a — `@filer/cli` lib export (filer repo)

Changes to the existing Filer CLI repo:

- [ ] Create `src/lib/index.ts` — public API surface (see architecture doc §3)
- [ ] Create `src/lib/query.ts` — thin wrapper over query command internals
- [ ] Create `src/lib/export.ts` — thin wrapper over export command internals
- [ ] Add `"./lib": "./dist/lib/index.js"` to `exports` in `package.json`
- [ ] Run `npm run build && npm test` — all 178 tests must pass
- [ ] Publish `@filer/cli@1.2.1` to npm with lib export
- [ ] Commit + push

### 0b — `openfiler-web` repo

- [ ] `npx create-next-app@latest openfiler-web --typescript --tailwind --app --src-dir no`
- [ ] Install core dependencies:
  ```bash
  npm install \
    @filer/cli@1.2.1 \
    next-auth \
    kysely pg \
    pg-boss \
    express \
    zod \
    lucide-react \
    class-variance-authority clsx tailwind-merge
  ```
- [ ] Install shadcn/ui: `npx shadcn@latest init`
- [ ] Configure `tailwind.config.ts` with design tokens (colours, fonts — see UX doc §2)
- [ ] Create `middleware.ts` — edge rate limiting + security headers (see architecture doc §4.1)
- [ ] Create `lib/validators.ts` — all input validation functions
- [ ] Create `lib/git-clone.ts` — hardened git clone wrapper
- [ ] Create `lib/keystore.ts` — browser AES-GCM key encryption
- [ ] Create `lib/key-audit.ts` — SHA-256 hash for rate-limit audit
- [ ] Create `lib/key-transit.ts` — AES-GCM worker transit encryption
- [ ] Create `lib/sse-writer.ts` — SSE stream abstraction
- [ ] Create `lib/db.ts` — Kysely DB client (singleton)
- [ ] Create `db/migrations/001_initial.ts` — all tables
- [ ] Create `app/api/health/route.ts` — `{ status: 'ok' }`

### 0c — Railway setup

- [ ] Create Railway project `openfiler`
- [ ] Provision Postgres service
- [ ] Run migrations: `npx kysely migrate latest` against Railway DB URL
- [ ] Verify pg-boss tables created on first worker startup
- [ ] Create worker `Dockerfile` + `railway.toml`
- [ ] Create bare `worker/index.ts` (starts pg-boss, health endpoint only — no job handlers yet)
- [ ] Deploy worker to Railway
- [ ] Verify `/health` returns 200

### 0d — Vercel setup

- [ ] Connect `openfiler-web` repo to Vercel
- [ ] Set all environment variables (see architecture doc §10)
- [ ] Deploy — `/api/health` returns 200
- [ ] Verify `middleware.ts` is applying security headers

### 0e — Shared UI shell

- [ ] `components/ModeLayout.tsx` — config panel (left, 400px fixed) + output panel (right, fills width)
- [ ] `app/page.tsx` — landing page with mode cards + URL input (see UX doc §6)
- [ ] Header with mode tabs + tier badges
- [ ] `components/SourceInput.tsx` — GitHub URL field + branch dropdown + zip upload
- [ ] `components/CliHandoff.tsx` — CLI command + copy + `npx @filer/cli@latest` CTA
- [ ] `components/OutputPanel.tsx` — state machine shell (idle/running/streaming/complete/error)
- [ ] URL persistence across mode tabs via React context
- [ ] Deploy + smoke test

**Exit criteria:** `https://openfiler.ai` loads, shows mode tabs, health endpoint returns 200, Railway worker is running.

---

## Phase 1 — Secrets (Tier 0)
**Goal:** First live, working feature. Validates the full Vercel→Railway Postgres stack under real traffic.

### Dependencies
- Phase 0 complete
- `@filer/cli/lib` exports `scanForSecrets`

### Checklist
- [ ] `app/api/secrets/route.ts`
  - Validate URL (`validateRepoUrl`) or zip (`validateZipUpload`, `validateZipEntries`)
  - Clone repo (`cloneRepo`) or extract zip to tmp
  - Call `scanForSecrets(files)`
  - Delete tmp dir in `finally`
  - Return `{ findings, fileCount, durationMs, cliCommand }`
  - Edge: max 60s execution; return partial result on timeout
- [ ] `app/(modes)/secrets/page.tsx` — config panel:
  - `SourceInput`
  - Scope field (optional, validated)
  - Run button with states
- [ ] Wire output panel for findings:
  - Zero findings: green success state
  - Findings: grouped by file, `SeverityBadge` per finding, line number, rule ID
  - Download JSON button
  - `CliHandoff` block
- [ ] `components/SeverityBadge.tsx` — CRITICAL (red) / WARNING (amber)
- [ ] Error states: invalid URL, clone failed, rate limit hit
- [ ] Write integration test: known repo with no secrets → 0 findings
- [ ] Deploy + manually test against a public repo

**Exit criteria:** `filer secrets` equivalent working end-to-end on real public GitHub repos.

---

## Phase 2 — Pack (Tier 0)
**Goal:** Core pack feature live. Tier 0 only (no `--task`). SSE streaming infrastructure established.

### Dependencies
- Phase 1 complete
- `@filer/cli/lib` exports `packFiles`, `formatOutput`, `compress`

### Checklist
- [ ] `lib/job-runner.ts` — server job runner (clone → pipeline → stream)
- [ ] `app/api/pack/route.ts`
  - Validate inputs
  - Clone repo
  - Run `packFiles` + `formatOutput`
  - Stream output via SSE (`SSEWriter`)
  - Return `JobMeta` on complete (tokens, files, duration, cliCommand)
- [ ] `app/(modes)/pack/page.tsx` — config panel:
  - `SourceInput`
  - Format selector (Markdown / XML / JSON)
  - Compress toggles (off / comments only / full)
  - Advanced section (collapsed): include/exclude, line numbers, git log, git diff
  - Task toggle (visible but disabled — shows "Coming soon — BYOK" placeholder)
- [ ] `components/OutputPanel.tsx` — streaming state:
  - Progress bar during clone + scan
  - Virtualised scroll for large outputs (react-virtual or similar)
  - Token count + file count in header
  - Download button (client-side Blob)
  - Copy button with `✓ Copied` feedback
  - `CliHandoff`
- [ ] Handle large outputs gracefully (truncate preview at 50KB, full content in download)
- [ ] Write integration test: known repo → expected token count range
- [ ] Deploy + manually test

**Exit criteria:** Pack streams correctly for repos of varied sizes. Download produces valid Markdown/XML/JSON.

---

## Phase 3 — Export (Tier 0)
**Goal:** Knowledge export live. Introduces `.filer/` detection and node rendering.

### Dependencies
- Phase 2 complete (output panel patterns established)
- `@filer/cli/lib` exports `readAllNodes`, `exportNodes`

### Checklist
- [ ] `app/api/export/route.ts`
  - Clone repo
  - Check for `.filer/` directory — return `{ hasFiler: false }` if missing (not an error)
  - Call `exportNodes(root, opts)`
  - Return `{ content, nodeCount, hasFiler, durationMs, cliCommand }`
- [ ] `app/(modes)/export/page.tsx` — config panel:
  - `SourceInput`
  - Node type multi-select (all checked by default)
  - Scope field (optional)
  - Verified-only toggle
  - Format: Markdown / JSON
- [ ] `components/NodeCard.tsx` — renders one knowledge node:
  - Type badge (colour-coded)
  - Confidence percentage
  - Verified badge (if verified)
  - Statement text
  - Scope path
- [ ] Empty state — no `.filer/` detected:
  - Explains what `.filer/` is
  - Shows example repo that has it (`github.com/dkeswani/filer`)
  - CTA: `npx @filer/cli@latest`
- [ ] Deploy + test against `github.com/dkeswani/filer`

**Exit criteria:** Export renders all node types correctly, empty state works gracefully.

---

## Phase 4 — Async Infrastructure
**Goal:** Large-job queue working end-to-end. No user-facing mode yet — this is plumbing for Phase 5+.

### Dependencies
- Phase 3 complete
- Railway Postgres running

### Checklist
- [ ] `lib/job-sizer.ts` — GitHub API size pre-flight
  - `GITHUB_PAT` env var set with correct scope
  - Returns `{ modules, sizeMb }` + fail-safe (route to async on error)
- [ ] `lib/job-store.ts` — pg-boss wrapper:
  - `enqueue(data)` → returns `jobId`
  - `subscribe(jobId, onEvent)` — Postgres `LISTEN/NOTIFY`
  - `getEvents(jobId)` — replay missed events from job event log
- [ ] Add `events` JSONB column to pg-boss job data (for replay)
- [ ] `app/api/jobs/route.ts` — unified job submission:
  - Validate inputs
  - `estimateJobSize()` → route inline vs async
  - Inline: `handleInline(spec, key)`
  - Async: `handleAsync(spec, key)` → `{ jobId, stream }`
- [ ] `app/api/jobs/[id]/stream/route.ts` — SSE relay
- [ ] `app/api/jobs/[id]/route.ts` — poll status (fallback for SSE-impaired clients)
- [ ] `lib/job-client.ts` — browser unified SSE consumer
- [ ] Worker: add `boss.work('filer-job', ...)` handler (stub — logs job receipt, marks complete)
- [ ] `components/JobSizeWarning.tsx` — shown when estimate > threshold
- [ ] End-to-end test: submit stub job, verify SSE events arrive in browser
- [ ] `lib/key-transit.ts` — encrypt/decrypt BYOK key for worker transit
- [ ] `components/LLMKeyPrompt.tsx`:
  - BYOK radio: provider dropdown (auto-detect from prefix), key field, clear button
  - Hosted radio: cost estimate + sign-in CTA (sign-in is Phase 8 — show as "Coming soon" for now)
  - Security note (two lines, muted)
- [ ] `components/CostEstimate.tsx` — token estimate × provider rate
- [ ] Deploy + verify async flow works (stub jobs stream correctly)

**Exit criteria:** Large job submitted → `jobId` returned → SSE stream delivers events → job completes. Worker receives and processes stub jobs.

---

## Phase 5 — Scan (BYOK)
**Goal:** Full security scan live with BYOK. First paying-adjacent feature.

### Dependencies
- Phase 4 complete
- `@filer/cli/lib` exports `runIndex`, `readAllNodes`
- Worker job handler wired

### Checklist
- [ ] `lib/job-runner.ts` — add scan handler:
  - Clone repo
  - Run `runIndex` (with LLM via `gateway` built from BYOK key)
  - Collect all nodes via `readAllNodes`
  - Generate report HTML (reuse `generateReport` from CLI)
  - Stream progress events via `PgNotifyPublisher`
  - Return `{ reportHtml, nodeCount, tokens, cost, ... }`
- [ ] Worker: handle `filer-job` where `spec.mode === 'scan'`
  - Saves report HTML to `reports` table
  - Deletes `llmKeyEncrypted` from job record on completion
- [ ] `app/(modes)/scan/page.tsx`:
  - `SourceInput`
  - `LLMKeyPrompt` (shown immediately — scan always needs LLM)
  - Scope field
  - Speed toggle (Standard / Fast)
  - Fail-on severity selector
  - `JobSizeWarning`
  - `CostEstimate`
- [ ] Output panel for scan:
  - Severity summary (CRITICAL / HIGH / MEDIUM / INFO counts)
  - Embedded report iframe (from Railway worker URL)
  - Share link (copies worker URL)
  - Download HTML
  - `CliHandoff`
- [ ] `app/report/[id]/page.tsx` — redirect to `${WORKER_PUBLIC_URL}/reports/${id}`
- [ ] Key validation: test call to LLM provider before starting clone
- [ ] BYOK key error states: invalid key, key rejected by provider
- [ ] Deploy + test BYOK scan against a small public repo

**Exit criteria:** Full scan runs end-to-end with a BYOK Anthropic key. Report is embedded and shareable.

---

## Phase 6 — Query (BYOK)
**Goal:** Natural language query over knowledge nodes, with LLM synthesis.

### Dependencies
- Phase 5 complete (async infrastructure + BYOK patterns established)
- `@filer/cli/lib` exports `queryNodes`

### Checklist
- [ ] `lib/job-runner.ts` — add query handler:
  - Clone repo (or extract zip)
  - Check for `.filer/` — fail fast with clear error if missing
  - Call `queryNodes(root, question, gateway, opts)`
  - Stream answer tokens as `chunk` events
  - Return `{ answer, supportingNodes, tokens, cost }`
- [ ] Worker: handle `filer-job` where `spec.mode === 'query'`
- [ ] `app/(modes)/query/page.tsx`:
  - `SourceInput` with `.filer/` detection inline (shows warning if missing)
  - Question textarea (max 500 chars, live char count)
  - `LLMKeyPrompt`
  - Advanced (collapsed): type filter, scope
- [ ] Output panel for query:
  - Streaming answer text (typewriter effect as chunks arrive)
  - Supporting nodes section (collapsed by default, `NodeCard` per node)
  - Copy answer button
  - `CliHandoff`
- [ ] Empty state: no `.filer/` detected (same as Export mode)
- [ ] Deploy + test

**Exit criteria:** Query answers stream correctly with supporting nodes cited.

---

## Phase 7 — Pack `--task` (BYOK)
**Goal:** Enable LLM-powered file selection in Pack mode. Completes the Pack feature.

### Dependencies
- Phase 6 complete

### Checklist
- [ ] `lib/job-runner.ts` — add `--task` handler for pack:
  - Clone repo
  - Call `selectRelevantFiles(gateway, files, task, tokenBudget)`
  - Continue with normal pack pipeline on filtered files
- [ ] Update `app/api/jobs/route.ts` to handle `mode === 'pack'` with `task` present
- [ ] Enable task toggle in Pack config panel:
  - Remove "Coming soon" placeholder
  - Wire `LLMKeyPrompt` + `CostEstimate`
  - Token budget field visible when task toggle is on
- [ ] Update `CliHandoff` to include `--task` flag in generated command
- [ ] Deploy + test

**Exit criteria:** `filer pack --task "..."` equivalent works end-to-end via web UI.

---

## Phase 8 — Hosted Tier (Auth + Billing)
**Goal:** Users can run LLM features without a personal API key. Sustainable revenue.

### Dependencies
- Phase 7 complete
- Stripe account set up
- GitHub OAuth app created

### Checklist

**Auth:**
- [ ] `app/api/auth/[...nextauth]/route.ts` — NextAuth.js with GitHub provider
- [ ] `lib/session.ts` — server-side session helper
- [ ] Sign-in page + redirect flow
- [ ] User row created in DB on first GitHub sign-in
- [ ] `app/account/page.tsx` — usage history, current balance, payment method

**Billing:**
- [ ] Stripe Metered Billing product + price set up (per-token or per-job)
- [ ] `app/api/billing/webhook/route.ts` — Stripe webhook handler
- [ ] Usage ledger writes (`usage_events.billed_usd`) after each Hosted job
- [ ] $1 sign-up credit: insert credit row on new user creation
- [ ] Stripe customer created on first payment method added

**Hosted LLM proxy:**
- [ ] Update `app/api/jobs/route.ts`:
  - `tier === 'hosted'`: verify auth session + credit/payment method
  - Pass server `ANTHROPIC_API_KEY` to job runner (no `X-LLM-Key` needed)
- [ ] Update Worker: detect `tier === 'hosted'`, use `process.env.ANTHROPIC_API_KEY`
- [ ] Enable "Use Hosted" option in `LLMKeyPrompt` (remove "Coming soon")
- [ ] Show cost estimate with "charged to your account" copy
- [ ] Post-job cost confirmation in output panel for Hosted jobs

**Exit criteria:** A new user can sign in with GitHub, receive $1 credit, run a Hosted scan, and see the charge in their account dashboard.

---

## Phase 9 — Landing Page + Launch
**Goal:** Site ready for public traffic. Product Hunt launch.

### Dependencies
- Phase 8 complete (all features live)

### Checklist
- [ ] Landing page hero: pre-run output demo on `github.com/dkeswani/filer` (static, fast)
- [ ] Mode cards explain features without jargon
- [ ] SEO: `<title>`, `<meta description>`, `og:image`, `twitter:card`
- [ ] `robots.txt` + `sitemap.xml`
- [ ] `worker.openfiler.ai` custom domain configured on Railway
- [ ] Analytics: Plausible (privacy-friendly, no cookies) or Vercel Analytics
- [ ] Error monitoring: Sentry (Vercel integration, free tier)
- [ ] Uptime monitoring: Better Uptime or UptimeRobot for `/health` + worker `/health`
- [ ] Load test: k6 script hitting Pack and Secrets with 50 concurrent users
- [ ] Product Hunt submission draft prepared
- [ ] `npx @filer/cli@latest` install tested on fresh macOS + Linux + Windows

**Exit criteria:** Site handles 50 concurrent Tier 0 jobs without degradation. All five modes work end-to-end.

---

## Cross-Phase Decisions (Don't Revisit)

These are locked. Changing them requires updating all three docs together.

| Decision | Value |
|----------|-------|
| URL validation | GitHub HTTPS only, strict regex |
| Key storage | AES-GCM + session-bound, never server-side plain text |
| Queue | pg-boss on Railway Postgres — no Redis |
| Worker host | Railway (same project as Postgres) |
| Report storage | Postgres TEXT, served by worker Express |
| Inline threshold | ≤30 modules AND ≤10MB |
| Rate limit Layer 1 | Vercel edge middleware (in-memory) |
| Rate limit Layer 2 | Postgres `rate_limits` table |
| Auth provider | GitHub OAuth via NextAuth.js only |
| Hosted provider | Anthropic only (v1) |
| `@filer/cli` versioning | Pinned, updated via PR + tests |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `@filer/cli/lib` export introduces bugs | Medium | High | All 178 CLI tests must pass; lib export is thin wrappers only |
| Vercel 60s timeout on inline pack for large repos | Medium | Medium | Job router sends to async if estimate > threshold; inline is only for small repos |
| git clone of malicious repo | Low | High | URL allowlist + exec flags + timeout + SIGKILL + no code execution |
| Zip slip attack via upload | Low | High | Path traversal check on every zip entry before extraction |
| BYOK key leaked in logs | Low | Critical | Never log `X-LLM-Key` header; Vercel log drain must be audited |
| Railway Postgres connection exhaustion | Medium | Medium | Add pgBouncer if connection count exceeds 20 concurrent |
| Worker crash drops async job | Low | Medium | pg-boss retries failed jobs automatically; worker restarts via Railway |
| Phase 0 takes longer than expected | Medium | High | Phases 1–3 are Tier 0 (no LLM) — ship them while Phase 4 async infra is built |
