# Changelog

All notable changes to `@filer/cli`. This project follows [Semantic Versioning](https://semver.org/).

## v1.6.0 — 2026-05-12

### Breaking changes

- Removed `filer scan` command. Use `filer secrets` for fast secret scans, and `filer audit` (v1.5.1+, upcoming) for deeper security analysis with durable typed nodes.
- Removed `filer agent` command and entire `src/agent/` directory. Event dispatch is covered by invoking the underlying commands directly (`filer layer --update`, `filer learn`, `filer secrets --ci`). The ReAct loop had no test coverage and was an unvalidated experiment.
- Removed `filer benchmark` command. The benchmarking tooling was demo/sales-focused and not part of the core knowledge-layer workflow.
- Removed `filer measure` command. The GitHub PR analytics functionality was not part of the core product.

### Internal

- Relocated `SEVERITY_MAP` from `src/report/generator.ts` to `src/review/severity.ts`.
- Removed `src/report/` directory entirely. The HTML report was used only by the removed `scan` command.
- Added `INTERNAL-ARCHITECTURE.md` to the repo (not shipped to npm).

### Impact

- Bundle size reduced from 217 KB to 185 KB packed
- Test count: 181 passing (down from 235; only removed-feature tests dropped)
- Public API in `src/lib/index.ts` unchanged — no impact on programmatic consumers
- 4 commands removed; 21 commands remain

## v1.5.x

- v1.5.3: `root` option on `layerCommand` and `graphCommand` to avoid `process.chdir()` (serverless safety)
- v1.5.2: Export store helpers and schema from public API (`src/lib/index.ts`)
- v1.5.0: Knowledge graph (`graph`, `explain`, `governing` commands), skill installer, MCP server with 13 tools, `origin_repo` on nodes

## v1.4

- Templates library (20 bundled production-ready templates)
- `agent` command (Phase 1 event orchestrator + Phase 2 ReAct loop) — removed in v1.6.0
- `benchmark` command — removed in v1.6.0

## v1.3

- `learn` command — mine GitHub PR comments for knowledge signals
- `measure` command — GitHub PR analytics — removed in v1.6.0
- MCP server (initial)
- Smart-compress (AST-aware) for `pack`
- `layer` consolidation: `index` and `update` became aliases

## v1.2

- `secrets` command + `secretlint` integration
- `scan` command — removed in v1.6.0
- `pack` command (replaces repomix)
- `wizard` interactive setup

## v1.1

- `update` command for incremental knowledge layer updates
- `review` / `verify` commands
- `query` LLM synthesis

## v1.0

- Initial release: `init`, `index`, `show`, `stats`, `hook`, `query`, `export`
- Eight typed node kinds (security, constraint, danger, pattern, decision, antipattern, assumption, intent)
- Core extraction pipeline
