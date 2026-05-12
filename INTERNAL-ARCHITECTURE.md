# Filer — Internal Architecture

> **Audience:** Maintainer deciding what earns its place. This document describes what each module does mechanically, what depends on it, when it was introduced, and whether it looks solid or shaky.

---

## Repository Layout

```
src/
├── cli.ts                  ← Entry point (Commander, 25 commands)
├── commands/               ← One file per command
├── pipeline/               ← File scanning, LLM extraction, staleness
├── store/                  ← Node I/O, index management
├── schema/                 ← Zod schemas for nodes, config, index
├── graph/                  ← AST parsing, semantic attachment, D3 viewer
├── llm/                    ← Multi-provider LLM gateway
├── agent/                  ← ReAct loop + event orchestrator
├── mcp/                    ← MCP server (Claude Code / Cursor integration)
├── pack/                   ← Context packing with compression
├── report/                 ← HTML security report
├── review/                 ← Review bundle + HTML review UI
├── security/               ← secretlint wrapper
└── lib/                    ← Public programmatic API
```

---

## Data Model: `.filer/`

Everything lives in the repo alongside code. No backend.

```
.filer/
├── index.json              ← Master manifest (all node summaries + coverage stats)
├── .filer-config.json      ← Provider, models, include/exclude, module strategy
├── agent-log.md            ← Append-only audit trail from filer agent
├── {type}/                 ← Subdirectory per node type (8 types)
│   └── {id-slug}.json      ← Individual node
├── graph.json              ← AST nodes + structural edges + governs edges
├── GRAPH.md                ← Human-readable graph summary
├── graph.html              ← D3 interactive viewer (self-contained HTML)
├── review/pending.json     ← Pending review bundle
└── cache/ast/              ← Incremental AST parse cache (gitignored)
```

### Node Types (8)

All share: `id` (type:slug), `version`, `created_at`, `updated_at`, `indexed_by` (LLM model), `scope` (glob paths), `tags`, `confidence`, `verified`, `stale_risk`, `related`, `supersedes`, `must_not`, `origin_repo` (optional).

| Type | Unique Fields | What It Captures |
|---|---|---|
| `security` | severity, category, audit_required | Hardcoded secrets, injection risks, auth gaps |
| `constraint` | statement, because, if_violated, instead | Rules that must always hold |
| `danger` | condition, frequency, safe_pattern, history | Known bugs / landmines with mitigation |
| `assumption` | breaks_when | Context that the code relies on being true |
| `pattern` | structure, why, anti_pattern, deviations | Proven patterns with counter-examples |
| `decision` | reason, alternatives_rejected, revisit_if | Architectural choices with trade-offs |
| `antipattern` | correct_pattern | Looks right here, is wrong here |
| `intent` | owns, does_not_own, entry_points | Module purpose (diverges from code over time) |

---

## Commands (25)

Grouped by area. Each command is its own file in `src/commands/`. All pass through `ensureConfig()` or `ensureFilerExists()` guards from `src/commands/utils.ts`.

### Bootstrap

**`init`** — Create `.filer/`, prompt for LLM provider (interactive or --provider flag), install bundled templates, optionally install git hook. Validates templates before any I/O. Has --force for reinit. Introduced v1.0.

**`wizard`** — Interactive setup that fires when no `.filer/` is detected. Detects project type (JS/Python/Go/etc.), runs cost estimate, calls init + scan. Introduced v1.2. Exists mainly for first-run UX — not used programmatically.

**`stats`** — Dashboard. Node counts by type, coverage %, verification %, stale count, KCI (Knowledge Coverage Index), AUI (Agent-Unverified Index) per module. Reads from index.json. v1.0.

### Core Workflow

**`layer`** — The primary command. Two modes under one flag:
- Default: full build. Scan → group → LLM extract → write nodes.
- `--update`: incremental. Git diff → mark stale → re-extract changed + stale modules.
- Also: `--cost` (estimate only), `--dry-run`, `--force`, `--parallel <n>`, `--detect-conflicts` (LLM contradiction check).
- Absorbed `filer index` and `filer update` as hidden aliases. v1.3 (consolidation); original extraction was v1.0.

**`index`** — Silent alias → `layer`. Kept for backward compat. v1.0, aliased v1.3.

**`update`** — Silent alias → `layer --update`. Called by git post-commit hook. v1.1, aliased v1.3.

**`hook <install|uninstall|status>`** — Manage `.git/hooks/post-commit`. Hook runs `filer layer --update --silent` after each commit. v1.1.

### Security

**`secrets`** — Fast static scan via secretlint. No LLM. `--json` and `--ci` (exit 1 on findings) flags. Standalone — does not write nodes. v1.2.

**`scan`** — Full security pass: runs extraction for all files, injects `secrets` findings as CRITICAL security nodes, generates HTML report. `--fail-on high|critical` for CI gates. Depends on `secrets` + `layer` internals + `report/generator.ts`. v1.2.

### Knowledge Access

**`show [id]`** — Display a single node by ID or a filtered list (`--type`, `--scope`, `--verified`, `--json`). Reads from disk. v1.0.

**`query <question>`** — Natural language search. Keyword-match first, then LLM synthesis. `--no-llm` for keyword-only, cheap. Returns 2–4 paragraph answer with cited node IDs. v1.1.

**`export`** — Dump nodes as Markdown with header metadata. Pipe-friendly. Useful for injecting context into LLM prompts manually. v1.1.

### Graph & Traversal

**`graph`** — Build knowledge graph: AST extraction → semantic attachment → governs edges. Writes graph.json, GRAPH.md, graph.html. `--incremental` (cache), `--open`, `--max-nodes`. v1.5.

**`explain <id>`** — Traverse graph outward from a node (AST or semantic) up to `--depth`. Shows what a node governs or is governed by. Depends on graph.json being current. v1.5.

**`governing <id>`** — Reverse of explain: given an AST node (file, function, class), list all semantic nodes that govern it. `--type` filter. v1.5.

### Curation & Review

**`review`** — Two modes:
- Default: generate HTML review UI with node cards (approve / reject / amend buttons).
- `--tty`: interactive CLI review using inquirer.
- `--apply`: commit approved decisions back to node files.
- `--stale`, `--unverified-only`, `--type` filters.
- Depends on `review/bundle.ts` and `review/html.ts`. v1.1.

**`verify`** — Alias → `review --tty`. Old name. v1.1, aliased v1.2.

### Learning & Measurement

**`learn`** — Mine GitHub PR review comments for knowledge signals. Classifies comment type (constraint suggestion, danger report, etc.), clusters by theme across PRs, proposes new nodes. `--auto-apply` for ≥0.85 confidence. `--pr <n>` for single PR, `--from-file` for Slack/Bitbucket exports. Requires GitHub token. v1.3.

**`measure`** — GitHub PR analytics: commit count, review time, comment sentiment, productivity metrics over time. Pivot flags `--since`, `--before`, `--before-after`. v1.3. **Honest note:** useful for benchmarking Filer's impact, but also the command least likely to be used day-to-day. No tests observed.

**`benchmark`** — LLM response scoring with vs. without Filer context. Tasks: implement-feature, review-code, debug-issue. `--runs`, `--output json`. v1.4. **Honest note:** primarily a demo/sales tool for proving ROI. Not part of the core workflow.

### Integration

**`pack`** — Context packer (replaces repomix). Files + annotations + compression. Large option surface:
- `--task` (task-aware selection), `--tokens` (fit to budget), `--annotate` depth
- `--smart-compress` (AST-aware, ~70% token reduction)
- `--include-git-log`, `--remote` (clone on-the-fly), `--split`, `--output`
- Runs secretlint pre-flight warning before packing.
- v1.2.

**`mcp`** — Start MCP stdio server. 13 tools (see MCP section below). v1.3.

**`skill`** — Inject Filer instructions into `CLAUDE.md`, `.cursorrules`, `.codex/instructions.md`. `--agent claude|cursor|codex|all`, `--dry-run`. v1.5.

**`agent`** — Run Filer agent (see Agent section below). v1.4.

---

## Pipeline: How Extraction Works

`src/pipeline/indexer.ts` is the core engine. Called by `layerCommand` and `scan`.

```
runIndex(opts)
  scanFiles(root, config)         → eligible files per include/exclude globs
  groupIntoModules(files, config) → bundle by directory / package.json / explicit
  p-limit(concurrency):
    per module:
      extractNodes(module, config)
        buildExtractionPrompt()   → serialize files + repo context string
        gateway.complete()        → LLM call (deep_model or indexing_model)
        parseJSON()               → extract array from code block or raw JSON
        validateAndEnrich()       → Zod validate + auto-generate id / timestamps
      upsertNode()                → write each node to .filer/{type}/{slug}.json
      detectConflicts()?          → LLM check for contradicting pairs (--detect-conflicts only)
  buildIndex()                    → scan all nodes, compute stats, write index.json
```

**Incremental path** (`runUpdate`):
- `getChangedFiles(root, since)` — `git diff --name-only` since a ref
- `markStale()` — bump stale_risk on nodes whose scope globs intersect changed files
- Re-extract only: changed-file modules + stale nodes + high-stale-risk nodes
- Optional `checkStaleness()` — LLM re-validates stale nodes against the actual diff

`src/pipeline/scanner.ts` — `scanFiles()`, `groupIntoModules()`, `getChangedFiles()`. Also: chunking for files >2000 lines (split into 1800-line chunks with overlap context), binary file filtering, 500KB size cap.

`src/pipeline/extractor.ts` — `extractNodes()`. Builds prompt, calls gateway, parses and validates response. Handles LLM returning malformed JSON (strips markdown fences, retries).

`src/pipeline/staleness.ts` — `checkStaleness()`. LLM prompt asking "is this node still valid given this diff?". Optional — only runs with `--check-stale`. Moderately expensive.

---

## Store: Node Persistence

`src/store/writer.ts` — All disk I/O for nodes:
- `writeNode(root, node)` — Validate via AnyNodeSchema, write to `.filer/{type}/{slug}.json`
- `readNode(root, id)` — Load single node
- `readAllNodes(root)` — Scan all `.filer/*/` subdirectories and load everything
- `buildIndex()` — Compute stats, generate summaries, write `index.json`
- `nodeFilePath()` — Deterministic: `security:no-raw-sql` → `.filer/security/no-raw-sql.json`
- `ensureFilerDirs(root)` — Create `.filer/` + all 8 type subdirectories

`src/store/mod.ts` — Re-exports for the public API and openfiler-web runner.

**Depended on by:** nearly every command. The store is stable and central.

---

## Schema: Zod Validation

`src/schema/nodes.ts` — 8 node schemas as Zod discriminated union on `type`. `AnyNodeSchema` is the union. `AnyNode` is the TypeScript type.

`src/schema/index.ts` — Also defines:
- `FilerIndexSchema` — `{ filer_version, repo, indexed_at, llm, stats, nodes[] }`
- `FilerConfigSchema` — provider, models (model/indexing_model/deep_model/base_url), include[], exclude[], module_boundaries (strategy/max_depth/manifests), node_types (per-type: enabled, min_confidence, require_verification), auto_update, stale_threshold
- `NodeTypeConfigSchema` — per-type config shape

**Depended on by:** store, pipeline, commands/utils, lib/index. Schema is stable — last material change was adding `origin_repo` to BaseNodeSchema.

---

## LLM Gateway

`src/llm/gateway.ts` — Central routing:
- Task types map to model slots: `extract.full` → `deep_model`, `extract.update` / `verify.check` / `conflict.detect` → `indexing_model`, everything reasoning-heavy → `deep_model`
- 3 retries with exponential backoff
- Session stats: call count, estimated cost
- JSON extraction from responses: tries to strip markdown fences, falls back to raw parse

Provider implementations (`src/llm/`):
| File | Provider | Key Format | Notes |
|---|---|---|---|
| `anthropic.ts` | Claude (Haiku / Sonnet) | `sk-ant-...` | Prompt caching supported |
| `openai.ts` | GPT-4o / GPT-4o-mini | `sk-...` | Standard OpenAI SDK |
| `ollama.ts` | Local Ollama | none | HTTP to localhost:11434 |
| `kimi.ts` | Moonshot AI | `sk-...` | ~80% cheaper than Anthropic |

**Honest note:** Kimi and Ollama work but are not as battle-tested as Anthropic. Quality of node extraction degrades with smaller/cheaper models.

---

## Knowledge Graph

Introduced v1.5. The newest major subsystem — fewer field miles than the rest.

`src/graph/extractor.ts` — Parse source files using `web-tree-sitter`. Languages: TypeScript, JavaScript, Python. Outputs:
- `ASTNode[]` — id (ast:{kind}:{file}:{name}), kind (file/module/function/class/interface/export), source_file, line, language, exported
- `ASTEdge[]` — source, target, relation (contains / imports / imports:external / exports), confidence (EXTRACTED | INFERRED | AMBIGUOUS)
- Incremental: caches parse results in `.filer/cache/ast/`

`src/graph/attachment.ts` — Match semantic nodes (constraints, dangers, etc.) to AST nodes using scope globs. Generates `GovernsEdge[]` (source: semantic id, target: AST id, relation: "governs").

`src/graph/builder.ts` — Orchestrate extraction + attachment + inter-typed edges (related / supersedes / must_not). Write `graph.json`.

`src/graph/summary.ts` — Render `GRAPH.md` with stats table.

`src/graph/viewer.ts` — Generate self-contained `graph.html` with embedded D3 force-directed layout. Node colors by type. Click for detail panel.

`src/graph/types.ts` — TypeScript types for the graph data structures.

**Depended on by:** `graphCommand`, `explainCommand`, `governingCommand`, MCP tools (filer_scope, filer_governing, filer_affected, filer_explain).

**Honest note:** The graph is built separately from `layer` — you run `filer graph` after `filer layer`. This is a deliberate two-step but means `graph.json` can be stale relative to the knowledge layer. The `--incremental` flag helps but the caching logic is newer code.

---

## Agent

`src/agent/` — Two distinct modes under one `filer agent` command.

**Phase 1: Event Orchestrator (`orchestrator.ts`)**
Deterministic map: event → tool sequence.
- `commit` → `toolRunUpdate`
- `pr_merged` → `toolRunLearn`
- `ci` → `toolRunScan`
- `scheduled` → `toolRunUpdate` + optional staleness check
Safe, predictable, suitable for CI pipelines.

**Phase 2: ReAct Loop (`loop.ts`)**
When `filer agent` is called with no `--event`:
1. `observe()` — build repo state (stale nodes, unverified security, last update age)
2. `reason()` — LLM decides action + confidence score
3. Gate: must be ≥0.7 confidence to execute
4. `act()` — dispatch tool (runUpdate / runLearn / runScan / postSummary)
5. `reflect()` — append to agent-log.md, loop
6. Max 10 iterations

`src/agent/tools.ts` — Thin wrappers around pipeline functions, return `ToolResult`.
`src/agent/log.ts` — Append-only `agent-log.md`.
`src/agent/prompt.ts` — System prompt emphasizing conservatism ("prefer not acting").

**Honest note:** Phase 2 (ReAct) is architecturally clean but has no test coverage and the confidence threshold (0.7) is a magic number with no calibration data. Phase 1 is more mature.

---

## MCP Server (13 Tools)

`src/mcp/server.ts` — stdio MCP server for Claude Code / Cursor. Registered via `filer mcp`.

| Tool | What It Does |
|---|---|
| `filer_scope(paths[])` | All semantic nodes governing given file paths |
| `filer_query(question)` | Keyword search across knowledge |
| `filer_governing(file)` | All rules for a single file |
| `filer_affected(files[])` | Rules that apply to a file set (pre-PR gate) |
| `filer_check(code, scope)` | Validate code snippet against constraints |
| `filer_graph_stats()` | Coverage stats |
| `filer_explain(id)` | Traverse graph edges from a node |
| `filer_pack(options)` | Pack codebase for context injection |
| `filer_review_pending()` | Return pending review items |
| `filer_apply_review(decisions)` | Apply review decisions |
| + 3 more | Utilities (list nodes by type, node detail, etc.) |

Keyword scoring: case-insensitive word overlap (>3 chars). Simple but fast.

**Skill installer (`src/commands/skill.ts`)** — Writes Filer usage instructions into `CLAUDE.md`, `.cursorrules`, `.codex/instructions.md`. Makes `filer_scope` / `filer_query` part of the agent's system context automatically.

**Honest note:** The MCP server is the primary integration surface for AI agents — it's the thing that makes Filer actually useful inside Claude Code. Solid. The keyword search is intentionally lightweight (fast, deterministic, no LLM cost).

---

## Pack (`filer pack`)

`src/pack/` — Context packer. Large option surface, replaces repomix.

- `scanner.ts` — File discovery + token estimation + chunking (2000-line threshold)
- `annotator.ts` — Inject knowledge node summaries inline at depth: summary | full
- `compressor.ts` — Strip comments + empty lines (basic, ~20% reduction)
- `smart-compress.ts` — AST-aware comment stripping via tree-sitter (~70% reduction)
- `selector.ts` — Task-aware file selection + token budget fitting
- `formatter.ts` — Output: markdown | xml | json | plain
- `tree.ts` — Directory structure ASCII visualization
- `remote.ts` — Clone GitHub repos on-the-fly for packing

**Honest note:** `pack` is feature-complete but is a lot of surface area for what is essentially "put code in a prompt." The task-aware selector, smart-compress, and annotation injection are the differentiators. `remote.ts` (clone GitHub on-the-fly) overlaps with what openfiler-web does via ZIP download.

---

## Report

`src/report/generator.ts` — Generate self-contained HTML security report with embedded node data. Severity mapping: security→CRITICAL, danger→HIGH, constraint/assumption/antipattern→MEDIUM, pattern/intent/decision→INFO. Searchable + sortable table.

Used by: `filer scan`. Not used by any other command.

---

## Review

`src/review/bundle.ts` — Build `ReviewBundle` (generated_at, repo, review_items with node + status + confidence + requires_human). Write to `.filer/review/pending.json`.

`src/review/html.ts` — Generate interactive HTML review UI (approve/reject/amend per item).

`src/review/index.ts` — `applyDecisions()`: batch-update nodes based on review results, mark as `verified: true` or delete rejected nodes.

Used by: `filer review`, `filer verify` (alias), `mcp filer_review_pending`, `mcp filer_apply_review`.

---

## Security (`secretlint` wrapper)

`src/security/secretlint.ts` — Lazy-loads secretlint config once per process. Scans for AWS keys, GitHub tokens, API keys, PII. Returns `SecretFinding[]` (filePath, ruleId, message, line, severity).

Used by: `filer secrets` (standalone scan), `filer scan` (injects CRITICAL nodes), `filer pack` (pre-flight warning). Stable and well-contained.

---

## Commands Utils

`src/commands/utils.ts` — Shared helpers used by almost every command:
- `ensureFilerExists(root)` — Guard: print error + exit 1 if no `.filer/`
- `ensureConfig(root)` — Guard: load + Zod-validate config, exit 1 on failure
- `filterNodes(nodes, opts)` — Apply type / scope / verified / stale filters
- `sortByPriority(nodes)` — NODE_PRIORITY: security > constraint > danger > assumption > antipattern > pattern > intent > decision
- `loadNodes(root, opts)` — One-shot: load + filter + sort

---

## Public API (`src/lib/index.ts`)

Exports for programmatic use (used by openfiler-web):

```typescript
export { layerCommand }            // from commands/layer
export type { LayerOptions }
export { graphCommand }            // from commands/graph
export type { GraphOptions }
export { ensureFilerDirs, writeConfig, writeIndex }  // from store/mod
export { FilerConfigSchema, FILER_VERSION }          // from schema/mod
export { queryNodes }              // from lib/query
export type { QueryOptions, QueryResult }
export { exportNodes }             // from lib/export
export type { ExportOptions, ExportResult }
export { scanSecrets }             // from lib/secrets
export type { SecretsOptions, SecretFinding, SecretScanResult }
export { readIndex, readConfig, readAllNodes }       // from store/mod
export type { AnyNode, NodeType, FilerIndex }        // from schema/mod
```

---

## Release History (Summarised)

| Version | What was added |
|---|---|
| v1.0 | init, index, show, stats, hook, query, export. Core extraction pipeline. |
| v1.1 | update (incremental), review/verify, query LLM synthesis |
| v1.2 | secrets, scan, pack (replaces repomix), secretlint integration, wizard |
| v1.3 | learn, measure, MCP server, smart-compress, layer consolidation (aliases) |
| v1.4 | benchmark, agent (Phase 1 + Phase 2), bundled templates |
| v1.5 | graph, explain, governing, skill installer, 13 MCP tools, public API, origin_repo on nodes |
| v1.5.3 | root option on layerCommand/graphCommand (avoids process.chdir in serverless) |

---

## Honest Assessment: What Earns Its Place

**Proven, central, no realistic cut:**
- `layer` / `pipeline/` / `store/` / `schema/` — the whole point of the tool
- `secrets` / `scan` / `security/` — important standalone value
- `show`, `query`, `export` — daily access patterns
- `graph` / graph subsystem — new but architecturally distinct and load-bearing for MCP
- MCP server — primary AI agent integration surface
- `hook` — the zero-friction auto-update path
- `review` — necessary for verification workflow

**Good but questionable ROI in a redesign:**
- `benchmark` — pure sales/demo tool. No ongoing operational value. No test coverage.
- `measure` — GitHub analytics. Interesting for evangelism, not for the knowledge layer itself.
- `agent` Phase 2 (ReAct loop) — clean code but no test coverage and unvalidated confidence threshold. Phase 1 (event orchestrator) is the proven path.
- `wizard` — first-run UX wrapper. Fine to keep, zero cost, but also zero ongoing value once you're set up.
- `pack` / `remote.ts` — the remote-clone feature duplicates what openfiler-web does differently. The pack command itself is useful for local use.

**Half-built or needs attention:**
- `agent-log.md` — written by agent but never surfaced to any UI or command. You can't query it.
- Graph incremental caching — works but the cache invalidation logic is newer and less tested than the rest.
- `skill` installer — writes static instructions that can go stale as Filer evolves. No mechanism to update them.

---

*Generated from source: v1.5.3, May 2026.*
