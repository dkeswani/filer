# Filer Roadmap

*Last updated: 2026-04-25 · v1.4.0*

---

## What shipped in v1.4.0

- **Bundled template library** — 20 production-ready nodes installable with `filer init --templates`
- **`filer init --templates <categories>`** — security, migrations, error-handling, data-access, api, meta
- **Template validation before I/O** — invalid category exits non-zero before touching disk
- **Add-templates-only mode** — `filer init --templates` on an existing repo installs without re-scaffolding
- **Skip-on-conflict** — templates never overwrite nodes already in `.filer/`

---

## What shipped in v1.3.x

- `filer layer --parallel <n>` and `--fast` — concurrent module processing, cheap model routing
- `filer scan` — full LLM security scan → `.filer/report.html`, CI integration via `--ci --fail-on`
- `filer review` — HTML review UI + `pending.json` bundle; `--tty` interactive mode; `--apply`
- `filer export` — Markdown dump, pipe-friendly, `--type / --scope / --verified / --output`
- `filer query` — natural language question → LLM-synthesized answer with node citations
- `filer agent` — event-driven orchestrator + ReAct reasoning loop
- `filer learn --from-file` — GitLab / Bitbucket / Slack export support
- MCP server (8 tools) — Claude Code integration via `.claude/mcp.json`
- GitHub OAuth Device Flow — auto token: env → `.env` → `gh` CLI → device flow
- Kimi provider (`kimi-k2.6`, `MOONSHOT_API_KEY`, ~80% cheaper than Sonnet)
- LLM staleness check (`--check-stale`)
- `filer secrets` — zero-cost static credential scan via secretlint
- Smart compress (`--smart-compress`) — AST-aware comment stripping via tree-sitter
- Streaming ZIP extraction for large remote repos — never buffers full archive

---

## Next — Quality & Trust

### Extraction prompt calibration study
- Run `filer benchmark` against 5 well-known OSS repos
- Publish reproducible extraction quality measurements
- Output: prompt improvements + public benchmark numbers
- **Effort**: 1–2 days · **Status**: todo

### `filer learn` precision calibration
- Target: < 10% false positives at confidence ≥ 0.85 before `--auto-apply` is safe to advertise broadly
- Method: build labeled test set from real PR history, tune `learn.classify` prompt
- **Effort**: 1 day · **Status**: todo

### Large file chunking (> 2000 lines)
- Split by exported symbol boundaries, extract per-chunk, deduplicate at merge
- Currently untested on very large files — silent failure risk
- **Effort**: 1 day · **Status**: todo

---

## Next — Distribution

### Template library v1.1
- Cross-references between related templates (`related` array)
- Additional categories: `async-patterns`, `testing`, `observability`
- **Effort**: 2 days · **Status**: todo

### Public repo seeding
- Open PRs against high-profile OSS repos adding `.filer/` + `filer.md`
- Each merged PR is a permanent distribution node
- **Status**: ongoing

---

## Next — Polyarchy Foundation

These are neutral OSS features that support future analytics tooling.

### Agent authorship metadata in nodes
- Detect agent-authored commits (co-authored-by headers, commit message patterns)
- Tag nodes from agent-authored code with `authored_by: 'agent'`
- Data source for per-module Agent Understanding Index (AUI)
- **Effort**: 1 day · **Status**: todo

### KCI/AUI per-module in `filer stats`
- Knowledge Coverage Index + Agent Understanding Index displayed per module
- Natural extension of `stale_risk` already in schema
- **Effort**: 1 day · **Status**: todo

---

## Open Design Questions

1. **Agent trust boundary** — at what confidence threshold does the agent act vs. queue? Configurable per repo?
2. **Prompt versioning** — when extraction prompts change, existing nodes were generated with old prompts. Migration strategy?
3. **Node granularity** — function-level vs. file-level vs. module-level: what produces highest agent comprehension with lowest noise?
4. **Test file analysis** — should `*.test.ts` files be opt-in? They contain implicit intent signals.
5. **Agent loop termination** — how does the ReAct loop know when it's done? Max iterations? LLM says `done`? Cost budget?

---

## Completed

| Feature | Version | Notes |
|---------|---------|-------|
| Bundled template library (20 nodes, 6 categories) | v1.4.0 | `filer init --templates` |
| Template validation before I/O, add-only mode | v1.4.0 | Bug fixes in `init` |
| `filer layer --parallel` + `--fast` | v1.3.x | Concurrent + cheap model routing |
| `filer scan` + HTML report + CI gate | v1.3.x | `--ci --fail-on high` |
| `filer review` + HTML UI + `--apply` | v1.3.x | pending.json + browser review |
| `filer export` | v1.3.x | Markdown dump, pipe-friendly |
| `filer query` | v1.3.x | LLM-synthesized answers with node citations |
| `filer agent` Phase 1 + Phase 2 | v1.3.x | Event orchestrator + ReAct loop |
| `filer learn --from-file` | v1.3.x | GitLab/Bitbucket/Slack export support |
| MCP server (8 tools) | v1.3.x | Claude Code, Cursor integration |
| GitHub OAuth Device Flow | v1.3.x | Auto token resolution |
| Kimi provider (kimi-k2.6) | v1.3.x | `MOONSHOT_API_KEY` |
| LLM staleness check (`--check-stale`) | v1.3.x | `src/pipeline/staleness.ts` |
| `filer secrets` | v1.2.x | secretlint, zero-cost, CI mode |
| Smart compress (`--smart-compress`) | v1.2.x | AST-aware via tree-sitter |
| Streaming ZIP extraction | v1.2.x | Large repos, no buffer limit |
| `filer pack` v1 | v1.2.x | Knowledge-annotated context packing |
| `filer benchmark` | v1.1.x | LLM judge, with/without context scoring |
| `filer learn` | v1.1.x | PR signal mining → node proposals |
| v1.0.0 — initial knowledge layer | v1.0.0 | 8 node types, `filer layer`, `filer show` |
