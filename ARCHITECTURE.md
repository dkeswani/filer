# Filer — Architecture

*v1.4.0 — 2026-04-25*

---

## Overview

Filer is a single CLI package (`@filer/cli`) distributed via npm. There is no server, no daemon, and no external service dependency beyond the LLM provider of your choice. The entire system lives in the repository it operates on, committed alongside the code it describes.

```
@filer/cli (npm)
│
├── CLI entry          src/cli.ts           Commander program, all command wiring
├── Schema             src/schema/          Node types, config schema, constants
├── Store              src/store/           Read/write nodes and index from .filer/
├── Pipeline           src/pipeline/        LLM extraction, incremental indexing, staleness
├── Pack               src/pack/            File scanning, compression, annotation, formatting
├── Security           src/security/        secretlint wrapper for credential scanning
├── Report             src/report/          HTML report generation (scan + review)
├── Review             src/review/          Pending bundle generation, HTML review UI
├── Agent              src/agent/           ReAct loop, event orchestrator, tool manifest
├── MCP                src/mcp/             MCP server (stdio) — 8 tools for Claude Code
├── LLM                src/llm/             Provider gateway (Anthropic, OpenAI, Kimi, Ollama)
├── Commands           src/commands/        One file per CLI command
├── Templates          src/templates/       Loader and installer for bundled templates
└── templates/                              20 production-ready AnyNode JSON files
```

---

## Data Model

### The `.filer/` directory

The knowledge layer is a directory of JSON files committed alongside source code. Structure:

```
.filer/
├── index.json              ← master manifest: all node summaries + stats
├── .filer-config.json      ← repo configuration (provider, models, scope)
├── agent-log.md            ← append-only audit trail of agent actions
├── review/
│   ├── pending.json        ← machine-readable review bundle
│   └── report.html         ← browser-based review UI
├── security/               ← SecurityNode files
├── constraint/             ← ConstraintNode files
├── danger/                 ← DangerNode files
├── assumption/             ← AssumptionNode files
├── antipattern/            ← AntipatternNode files
├── pattern/                ← PatternNode files
├── intent/                 ← IntentNode files
└── decision/               ← DecisionNode files
```

File naming: `.filer/<type>/<slug>.json` where slug is the portion of the node `id` after the colon. Example: `security:no-raw-webhook-logging` → `.filer/security/no-raw-webhook-logging.json`.

### Node types

All nodes share a base schema (`BaseNodeSchema` in `src/schema/nodes.ts`) and form a discriminated union (`AnyNodeSchema`) on the `type` field.

| Type | Schema extra fields | Priority |
|------|---------------------|----------|
| `security` | `severity`, `category`, `verification_required`, `audit_required` | Critical |
| `constraint` | `because`, `if_violated`, `instead` | Critical |
| `danger` | `condition`, `frequency`, `safe_pattern`, `history` | High |
| `assumption` | `relied_on_by`, `breaks_when`, `boundary` | High |
| `antipattern` | `why_it_looks_right`, `why_its_wrong_here`, `correct_pattern`, `seen_in` | High |
| `pattern` | `structure`, `why`, `anti_pattern`, `deviations` | Medium |
| `intent` | `purpose`, `owns`, `does_not_own`, `boundary` | Medium |
| `decision` | `reason`, `alternatives_rejected`, `decided_at`, `revisit_if` | Lower |

Node `id` format: `^[a-z]+:[a-z0-9-]+$`. The type prefix must match the `type` field.

Base fields on every node: `id`, `type`, `version`, `created_at`, `updated_at`, `indexed_by`, `scope` (glob array), `tags`, `confidence` (0–1), `verified`, `stale_risk` (0–1), `related`, `supersedes`, `must_not`.

### index.json

Written by `src/store/writer.ts:buildIndex()`. Contains:
- `filer_version`, `repo`, `indexed_at`, `last_commit`, `llm`
- `stats`: `files_indexed`, `nodes_total`, `by_type`, `coverage_pct`, `verified_pct`, `stale_count`
- `nodes[]`: lightweight `NodeSummary` objects (id, type, file, scope, summary, tags, confidence, verified, stale_risk, updated_at)

Agents load `index.json` first to orient, then fetch individual node files by id.

---

## Pipeline — How Nodes Are Extracted

`src/pipeline/indexer.ts` drives extraction. Flow:

```
filer layer
    │
    ├── readConfig()               load .filer/.filer-config.json
    ├── discoverModules()          glob include paths → group files into modules
    ├── [--update] filterChanged() compare mtime vs node updated_at, skip unchanged
    │
    └── for each module (--parallel N):
            ├── extractorPrompt()  build prompt from source files
            ├── gateway.complete() call LLM (deep_model or indexing_model with --fast)
            ├── parseNodes()       parse JSON array from LLM response
            ├── validateNodes()    AnyNodeSchema.parse() on each
            ├── [--detect-conflicts] checkConflicts() semantic contradiction check
            └── upsertNode()       write or merge with existing node
                    └── buildIndex() + writeIndex()
```

`upsertNode()` in `src/store/writer.ts` merges new LLM output with existing nodes: increments `version`, preserves `verified` state set by humans, resets `stale_risk` to 0.

---

## Staleness Detection

`src/pipeline/staleness.ts` — opt-in, runs with `filer layer --update --check-stale`.

For each node with `stale_risk > stale_threshold` (default 0.7):
1. Fetch git diff for the node's `scope` paths since `node.updated_at`
2. Ask LLM: "does this diff invalidate the node's claim?"
3. If yes: set `stale_risk = 1.0`, `verified = false`
4. Surface in `filer review`

---

## LLM Gateway

`src/llm/gateway.ts` — single entry point for all LLM calls. Routes by task type to the correct model:

| Task type | Model used | Notes |
|-----------|------------|-------|
| `extract.full` | `deep_model` | Full extraction pass |
| `extract.fast` | `indexing_model` | `--fast` flag or parallel indexing |
| `agent.reason` | `deep_model` | ReAct agent reasoning |
| `task.select` | `deep_model` | `filer pack --task` file selection |
| `staleness.check` | `deep_model` | Staleness verification |
| `learn.classify` | `deep_model` | PR signal classification |

Provider implementations: `src/llm/anthropic.ts`, `src/llm/openai.ts`, `src/llm/kimi.ts`, `src/llm/ollama.ts`.

---

## Pack Pipeline

`filer pack` assembles AI-ready context from the local repo (or a remote GitHub URL). Pipeline:

```
filer pack [--task X] [--tokens N]
    │
    ├── scanner.ts        discover + read files, compute token counts
    ├── selector.ts       [--task] LLM scores each file for relevance → ranked list
    ├── annotator.ts      load scope-matching nodes from index, format inline annotations
    ├── compressor.ts     [--compress] strip comments + empty lines
    │   └── smart-compress.ts  [--smart-compress] AST-aware via tree-sitter
    └── formatter.ts      assemble final output (markdown / xml / json / plain)
```

Remote repos (`--remote user/repo`): `src/pack/remote.ts` streams the GitHub ZIP directly via `unzipper.Parse({ forceStream: true })` — never buffers the full archive. Binary files, `node_modules`, `.git`, and `dist` are skipped during extraction.

---

## Agent

`src/agent/` — self-hostable ReAct loop. Zero new npm dependencies.

**Event mode** (`filer agent --event <type>`): deterministic orchestrator. Maps `commit → layer --update`, `pr_merged → learn`, `ci → scan --ci`, `scheduled → layer --update --check-stale`.

**ReAct mode** (`filer agent`): LLM observes repo state, selects a tool, executes, reflects, repeats until done. Tools are thin wrappers over existing commands. Confidence gates autonomy: `>= 0.85` auto-applies; `< 0.85` queues to `pending.json`; security nodes always queue.

Audit log appended to `.filer/agent-log.md` after every run.

---

## MCP Server

`src/mcp/server.ts` — stdio transport, MCP 1.0. Registered in `.claude/mcp.json` by `filer init`. Eight tools:

| Tool | What it does |
|------|--------------|
| `filer_scope` | Return nodes matching a set of file paths |
| `filer_query` | Keyword + LLM search across all nodes |
| `filer_node` | Fetch one node by id |
| `filer_stats` | Coverage and freshness stats |
| `filer_check` | Check a proposed action against constraint + security nodes |
| `filer_pack` | Pack codebase and return content |
| `filer_review_pending` | Load the pending review bundle |
| `filer_review_apply` | Commit approve/reject decisions |

---

## Template Library

`templates/` — 20 bundled `AnyNode` JSON files, installed with `filer init --templates`. Shipped in the npm tarball via the `files` array in `package.json`.

Loader (`src/templates/loader.ts`) resolves the templates directory via `import.meta.url` — works correctly both in the dev tree and when installed as a dependency.

Categories: `security` (6), `migrations` (4), `error-handling` (2), `data-access` (4), `api` (3), `meta` (1). `all` resolves all categories except `meta`.

Install behavior: skip-on-conflict — if a node with the same `id` already exists in `.filer/`, it is not overwritten. Every template ships `verified: false`; users adapt scope and verify.

---

## Security Scanning

`filer secrets` wraps [secretlint](https://github.com/secretlint/secretlint) (`src/security/secretlint.ts`) for zero-cost static credential detection. No LLM.

`filer scan` runs a full LLM extraction pass focused on security and injects any `filer secrets` findings as `CRITICAL` nodes. Produces `.filer/report.html` via `src/report/generator.ts`.

---

## Storage Conventions

All disk I/O goes through `src/store/writer.ts`. Key functions:

| Function | Description |
|----------|-------------|
| `nodeFilePath(root, node)` | `.filer/<type>/<slug>.json` |
| `writeNode(root, node)` | Validates via `AnyNodeSchema.parse()` before writing |
| `upsertNode(root, node)` | Merge-update: preserves `verified`, increments `version` |
| `readNode(root, id)` | Read single node by id |
| `readAllNodes(root)` | Scan all type subdirs, parse every `.json` |
| `buildIndex(root, opts)` | Build `index.json` from all on-disk nodes |
| `loadNodesForScope(root, paths)` | Scope-filtered node loading for agent context |
| `markStale(root, scope)` | Increment `stale_risk` for scope-matching nodes |

---

## Testing

194 tests across 19 test files. All use vitest. Test files mirror source: `src/foo/bar.ts` → `src/foo/bar.test.ts`.

Critical tests:
- `src/templates/loader.test.ts` — every template in the manifest passes `AnyNodeSchema.parse()`
- `src/schema/nodes.test.ts` — every node type round-trips through its schema
- `src/store/writer.test.ts` — upsert, merge, stale-marking, scope matching
- `src/commands/init.test.ts` — template validation before I/O, exit codes, add-only mode

Run: `npm test` (vitest run) · Build: `npm run build` (tsc + CJS shim)
