# openfiler.ai — Product Requirements Document

*v0.4 — 2026-04-23*

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

**Inputs (Tier 0):** GitHub URL or zip upload, format (Markdown/XML/JSON/Plain), remove-comments toggle, remove-empty-lines toggle, file-summary toggle, directory-structure toggle, top-N-files input, security-check toggle, line-numbers toggle, include/exclude globs, scope path.

**Inputs (Tier 1/2, additional):** Task description (triggers LLM file selection), token budget (only visible when task is enabled), LLM key prompt.

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

## 5b. Priority 1 — Pack Mode: Feature Parity vs Repomix + Differentiators

Repomix (repomix.com) is the closest competitor. The table below documents every option visible in their web UI, compared to filer's current Pack panel. Items marked **P1** must ship before public launch.

| Feature | Repomix web | Filer web (current) | Action |
|---------|-------------|---------------------|--------|
| Repo URL input | ✓ | ✓ | — |
| Zip file upload | ✓ | ✗ | **P1 — add zip upload to Pack panel and `/api/pack`** |
| Output format: XML | ✓ | ✓ | — |
| Output format: Markdown | ✓ | ✓ | — |
| Output format: Plain text | ✓ | ✓ | — |
| Output format: JSON | ✗ | ✓ | Filer advantage — keep |
| Remove comments toggle | ✓ (separate) | ✗ (bundled in "compress") | **P1 — split compress into two toggles: "Remove comments" + "Remove empty lines"** |
| Remove empty lines toggle | ✓ (separate) | ✗ (bundled) | **P1 — see above** |
| Show file summary section | ✓ | ✗ | **P1 — add `--no-file-summary` / `--file-summary` toggle** |
| Show directory structure section | ✓ | ✗ | **P1 — add directory structure toggle** |
| Show line numbers | ✓ | ✓ | — |
| Top N files (top-files-len) | ✓ | ✗ | **P1 — add numeric input, maps to `--top-files-len`** |
| Include glob filter | ✓ | ✓ (advanced, collapsed) | Promote to always-visible or keep advanced — review UX |
| Exclude glob filter | ✓ | ✓ (advanced, collapsed) | Same |
| Security check toggle | ✓ | ✗ (always off via `--no-security-check`) | **P1 — expose toggle; default on** |
| Private repo (GitHub token) | ✓ | ✗ | P2 — GitHub OAuth (already in Out of Scope v1.0; confirm deferral) |
| Token count in output stats | ✓ | ✓ | — |
| File count in output stats | ✓ | ✓ | — |
| Character count in output stats | ✓ | ✗ | **P1 — add char count to result stats bar** |
| Task-based file selection (`--task`) | ✗ | ✓ (BYOK, not wired yet) | Filer differentiator — P1 to wire up in UI |
| Scope path filter | ✗ | ✓ (advanced, collapsed) | Filer advantage — keep |
| Knowledge annotation export | ✗ | ✓ (filer-specific) | Filer advantage — surface in UI copy |
| **MCP Server** | ✓ (users call repomix from Claude Desktop) | ✗ | **P1 — publish `@filer/mcp` server** |
| **Tree-sitter compression** | ✓ (~70% token reduction, AST-aware) | ✗ (whitespace only, ~10-20%) | **P1 — add to filer CLI, expose in web UI as "Smart compress"** |
| GitHub Actions | ✓ (published action) | ✗ (CLI works in CI but no action) | P2 — add `filer/pack-action` after launch |
| Library API | ✓ | ✓ (`@filer/cli/lib`) | — |
| Custom instructions | ✓ | ✓ (`--instructions` / `filer.md`) | Filer goes further (knowledge layer) |
| Best practices docs | ✓ | ✗ | P2 — add after launch |

### P1 implementation checklist for Pack mode

#### Form features (web UI)
1. **Zip upload** — file input → `multipart/form-data` → API writes to tmp, passes `--input <path>` to filer CLI instead of `--remote`
2. **Split compress** — ✅ done: "Remove comments" + "Remove empty lines" toggles
3. **File summary toggle** — ✅ done
4. **Directory structure toggle** — ✅ done
5. **Top N files** — ✅ done
6. **Security check toggle** — ✅ done
7. **Char count** — ✅ done
8. **`--task` wiring** — add collapsed "AI selection" section (BYOK only): text input for task → enables LLM key entry → sends `--task` to filer CLI

#### Platform features (CLI + web)
9. **MCP Server (`@filer/mcp`)** — publish a Model Context Protocol server so users can call `filer pack`, `filer secrets`, and `filer query` directly from Claude Desktop, Cursor, and any MCP-compatible client without leaving the IDE. Scope: `pack` and `secrets` tools in v1 (Tier 0, no LLM needed); `query` and `scan` tools as BYOK in v1.1.
10. **Tree-sitter smart compression** — integrate tree-sitter to strip comments and dead whitespace at the AST level rather than with regex. Target: ~70% token reduction (matching repomix). Expose in web UI as a third compression mode: `Smart compress` alongside "Remove comments" and "Remove empty lines". Maps to new `--smart-compress` flag in filer CLI.

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
