# Filer

**The knowledge layer for codebases. Context packer. Security scanner. Self-updating agent.**

Filer is a single CLI that does six things:

1. **Extracts institutional knowledge** — constraints, security rules, dangers, patterns, and decisions — and stores them as structured nodes in `.filer/` alongside your code.
2. **Installs a starter knowledge layer** in seconds with `filer init --templates`, covering security, migrations, error handling, data access, and API patterns.
3. **Packs your codebase for AI** with `filer pack` — injects knowledge annotations inline, selects files by task relevance, and respects token budgets.
4. **Scans for security issues** with `filer scan` — generates an HTML severity report and integrates with CI via `--ci --fail-on high`.
5. **Learns from code review** with `filer learn` — mines PR review comments, identifies institutional knowledge signals, and proposes new nodes automatically.
6. **Runs as an autonomous agent** with `filer agent` — a self-hostable, zero-dependency orchestrator that responds to git events and keeps the knowledge layer current.

Ships as `npx @filer/cli@latest`. No server. No external service. The knowledge layer lives in the repo.

---

## Get started in one command

```bash
cd your-repo
npx @filer/cli@latest
```

The interactive wizard runs in one session:

1. **Detects your project type** — Next.js, Python/FastAPI, Express, Go, Rust, TypeScript, JavaScript
2. **Asks which LLM provider** — Anthropic (default), OpenAI, Kimi (~80% cheaper), or local Ollama
3. **Handles your API key** — reads from environment, or prompts and saves to `.env`
4. **Shows a cost estimate** with a 5-second countdown before any API calls (Ctrl+C to cancel)
5. **Builds the knowledge layer** — scans your codebase, extracts nodes, shows live progress
6. **Highlights the top finding** — most critical security issue or highest-confidence constraint

When the wizard finishes, your repo has a committed `.filer/` directory, a `filer.md` that tells agents how to load it, and a `.claude/mcp.json` wiring Filer into Claude Code automatically.

---

## Jump-start with bundled templates

Don't want to build from scratch? Filer ships a curated library of 20 production-ready nodes covering the most common danger zones. Install them in any repo instantly:

```bash
# New repo — init and install templates in one step
filer init --templates security,migrations

# Existing repo — just add templates, keep everything else
filer init --templates all
```

Available categories:

| Category | Templates | What it covers |
|----------|-----------|----------------|
| `security` | 6 | Hardcoded secrets, SQL injection, PII in logs, authorization gaps |
| `migrations` | 4 | Destructive migrations, column narrowing, idempotency, rate limits |
| `error-handling` | 2 | Swallowed errors, typed error classes |
| `data-access` | 4 | N+1 queries, direct DB from handler, repository pattern, sync I/O |
| `api` | 3 | Controller hygiene, secrets in source, user ID format stability |
| `meta` | 1 | Self-describing node explaining the template pack |

`all` installs every category except `meta`. Templates ship `verified: false` with a generic `scope` — adapt them to your codebase, then run `filer verify <id>` to mark them trusted.

Browse the source: [`templates/`](./templates).

---

## What gets created

```
your-repo/
├── filer.md              ← agent instructions: how to load the knowledge layer
├── .claude/
│   └── mcp.json          ← MCP server config — 8 Filer tools in Claude Code immediately
└── .filer/
    ├── index.json        ← master manifest of all nodes
    ├── agent-log.md      ← audit trail of every agent run
    ├── review/
    │   ├── pending.json  ← machine-readable review bundle for agents + humans
    │   └── report.html   ← HTML review UI — approve/reject/amend in browser
    ├── security/         ← what must never be exposed or bypassed
    ├── constraint/       ← what this code must never do
    ├── danger/           ← where it breaks non-obviously
    ├── assumption/       ← what the code silently relies on
    ├── antipattern/      ← what looks right but is wrong here
    ├── pattern/          ← the local coding dialect
    ├── intent/           ← what each module owns and does not own
    └── decision/         ← why non-obvious choices were made
```

The `.filer/` directory is committed to the repo. Every developer and every agent starts with the same accumulated knowledge.

---

## How it looks in practice

**Pack your repo for an AI task — only the relevant files, with knowledge attached:**

```bash
filer pack --task "add Stripe webhook handler" --tokens 40000
```

Every file in the output arrives pre-annotated with the rules that govern it:

```
// ═══════════════════════════════════════════════════
// FILER KNOWLEDGE — src/payments/webhook.ts
// ═══════════════════════════════════════════════════
// [FILER 🔴 SECURITY ✓] security:no-raw-webhook-logging
//   Rule: Never log raw webhook payloads — contains PII
//   If violated: PII exposure, GDPR breach
//
// [FILER 🟡 CONSTRAINT] constraint:verify-stripe-sig
//   Rule: Always verify Stripe signature before processing
// ═══════════════════════════════════════════════════

export async function handleWebhook(req, res) { ...
```

The agent sees the constraints before reading a single line of code.

---

## Wire into your agent

For Claude Code, `.claude/mcp.json` is written automatically by the wizard — eight MCP tools are immediately available in every session: `filer_scope`, `filer_query`, `filer_node`, `filer_stats`, `filer_check`, `filer_pack`, `filer_review_pending`, `filer_review_apply`.

For any other agent, add one line to your `CLAUDE.md`, `AGENTS.md`, or `.cursorrules`:

```markdown
Before writing any code, read filer.md in the repo root and follow the Filer loading protocol.
```

---

## Daily usage

```bash
# Knowledge layer
filer layer                             # full build or rebuild
filer layer --update                    # incremental re-index from last commit
filer layer --update --check-stale      # + LLM staleness check on high-risk nodes
filer layer --parallel 4 --fast         # fastest: parallel + cheaper model
filer layer --cost                      # estimate API cost before running
filer stats                             # coverage and freshness dashboard

# Templates
filer init --templates security         # install security templates into .filer/
filer init --templates all              # install all templates (except meta)
filer init --templates all,meta         # install everything

# Pack for AI
filer pack                              # entire repo → stdout, knowledge-annotated
filer pack --task "add webhook"         # LLM selects only relevant files
filer pack --tokens 40000               # fit within token budget
filer pack --remote user/repo           # pack a remote GitHub repo without cloning
filer pack --compress                   # strip comments + empty lines
filer pack --format xml                 # XML output

# Knowledge exploration
filer export > FILER_CONTEXT.md         # dump all nodes as Markdown
filer export --type security,constraint > RULES.md
filer query "how does auth work"        # LLM-synthesized answer from knowledge nodes
filer show --type security              # view all security nodes

# Review and verify
filer review                            # HTML review UI + pending.json
filer review --tty                      # interactive y/n node verification
filer review --apply                    # commit decisions from a reviewed pending.json

# Security
filer secrets                           # fast static scan for hardcoded credentials (no LLM)
filer secrets --ci                      # CI mode — exits non-zero if any secrets found
filer scan                              # full LLM scan → .filer/report.html
filer scan --ci --fail-on high          # CI mode — exits non-zero on high/critical

# Learning
filer learn                             # propose new nodes from PR review history
filer learn --pr 147 --auto-apply       # single PR, auto-apply high-confidence nodes

# Autonomous agent
filer agent                             # ReAct loop — LLM decides what to do
filer agent --event commit              # post-push: re-index changed files
filer agent --event pr_merged --pr 147  # PR merged: mine review comments
filer agent --event ci                  # CI: security scan + fail gate
filer agent --event scheduled           # nightly: staleness check
filer agent --event scheduled --dry-run # preview what agent would do
```

---

## All commands

### Core

| Command | Description |
|---------|-------------|
| `filer` | Setup wizard (first time) or stats dashboard (already initialized) |
| `filer init [options]` | Initialize without the wizard |
| `filer layer [options]` | Build, rebuild, or incrementally update the knowledge layer |
| `filer stats` | Coverage and freshness dashboard |

`filer init` options: `--provider anthropic|openai|kimi|ollama`, `--model <name>`, `--no-hook`, `--force`, `--templates <categories>`

`filer layer` options:
- Build mode (default): `--scope <path>`, `--force`, `--dry-run`, `--cost`, `--parallel <n>`, `--fast`
- Update mode (`--update`): `--since <git-ref>`, `--silent`, `--check-stale`

---

### Templates

| Command | Description |
|---------|-------------|
| `filer init --templates <categories>` | Install bundled templates into `.filer/` |

Categories: `security`, `migrations`, `error-handling`, `data-access`, `api`, `meta`, `all`

`all` installs everything except `meta`. Comma-separate for multiple categories. Safe to run on an existing repo — templates already present are skipped.

---

### Scanning & reporting

| Command | Description |
|---------|-------------|
| `filer secrets [options]` | Fast static scan for hardcoded credentials — no LLM, instant results |
| `filer scan [options]` | Full LLM security scan — generates an HTML severity report |

`filer secrets` options: `--scope <path>`, `--json`, `--ci`

`filer scan` options: `--output <path>` (default `.filer/report.html`), `--scope <path>`, `--parallel <n>`, `--fast`, `--no-open`, `--force`, `--ci`, `--fail-on critical|high|medium`

---

### Packing & context

| Command | Description |
|---------|-------------|
| `filer pack [options]` | Pack codebase into AI-ready context with knowledge annotations |

`filer pack` options: `--scope <path>`, `--task <description>`, `--tokens <n>`, `--annotate summary|full`, `--no-annotate`, `--compress`, `--smart-compress`, `--format markdown|xml|json|plain`, `--remote <url>`, `--branch <name>`, `--include <globs>`, `--ignore <globs>`, `--sort-by-changes`, `--include-git-log`, `--include-git-diff`, `--split <size>`, `--line-numbers`, `--top-files <n>`, `--stats`, `--output <file>`, `--copy`, `--no-gitignore`, `--no-instructions`

---

### Exploration

| Command | Description |
|---------|-------------|
| `filer show [id]` | Display one or all nodes |
| `filer export` | Export all nodes as Markdown — paste into any agent context window |
| `filer query "<question>"` | Ask a question — returns LLM-synthesized answer with node citations |
| `filer review [options]` | HTML review UI + machine-readable bundle; `--tty` for interactive CLI |

`filer show` options: `--type <types>`, `--scope <path>`, `--verified`, `--json`
`filer export` options: `--type <types>`, `--scope <path>`, `--verified`, `--output <path>`, `--no-header`
`filer query` options: `--scope <path>`, `--type <types>`, `--no-llm`, `--json`
`filer review` options: `--tty`, `--type <types>`, `--stale`, `--unverified-only`, `--apply`, `--output <path>`, `--no-open`

---

### Agent

| Command | Description |
|---------|-------------|
| `filer agent [--event <type>]` | Event orchestrator or ReAct reasoning loop |

`filer agent` options: `--event commit|pr_merged|ci|scheduled`, `--pr <number>`, `--since <ref>`, `--auto-apply`, `--dry-run`, `--fail-on <severity>`

---

### Learning & measurement

| Command | Description |
|---------|-------------|
| `filer learn` | Mine PR review comments and propose new knowledge nodes |
| `filer measure` | Compute productivity metrics from GitHub PR history |
| `filer benchmark` | Score LLM responses with vs. without Filer context loaded |

`filer learn` options: `--since <date>`, `--pr <number>`, `--auto-apply`, `--dry-run`, `--from-file <path>`
`filer measure` options: `--since <date>`, `--before <date>`, `--before-after <date>`, `--pr <number>`
`filer benchmark` options: `--scope <path>`, `--task <name>`, `--runs <n>`, `--dry-run`

---

### Git hook

| Command | Description |
|---------|-------------|
| `filer hook install` | Install git post-commit hook for automatic updates |
| `filer hook uninstall` | Remove the hook |
| `filer hook status` | Check hook installation state |

---

### MCP server

| Command | Description |
|---------|-------------|
| `filer mcp` | Start the MCP server (stdio transport) for Claude Code / Cursor |

Eight tools: `filer_scope`, `filer_query`, `filer_node`, `filer_stats`, `filer_check`, `filer_pack`, `filer_review_pending`, `filer_review_apply`. Claude Code loads these automatically from `.claude/mcp.json`.

---

## filer init --templates

The bundled template library is the fastest way to get useful knowledge into `.filer/` — before running `filer layer`, before any LLM calls, instantly.

```bash
# On a fresh repo
filer init --templates security,migrations

# On an existing repo — just add templates, nothing else changes
filer init --templates error-handling,data-access

# Install everything except meta
filer init --templates all

# Install everything including the meta explanation node
filer init --templates all,meta
```

Each template is a valid `AnyNode` that passes schema validation. They ship as starting points:

- `verified: false` — mark verified after adapting and confirming it applies to your codebase
- `scope` is generic — narrow it to the actual paths in your repo
- `stale_risk: 0` — starts fresh, accumulates as code changes

If a node with the same `id` already exists in `.filer/`, it is skipped — your existing nodes are never overwritten.

---

## filer secrets

`filer secrets` is a fast, zero-cost static scan for hardcoded credentials — API keys, tokens, passwords — using [secretlint](https://github.com/secretlint/secretlint) under the hood. No LLM calls, no indexing required.

```bash
filer secrets                       # scan entire repo, print grouped findings
filer secrets --scope src/auth/     # limit to a subdirectory
filer secrets --json                # machine-readable JSON output
filer secrets --ci                  # exit 1 if any secrets found (for CI pipelines)
```

Use this as a pre-commit check or a lightweight CI gate. For a deeper report that includes architectural risks, dangerous patterns, and assumptions alongside credential findings, use `filer scan`.

---

## filer scan

`filer scan` runs a full LLM-powered security-focused extraction pass and writes a self-contained HTML report to `.filer/report.html`. It also runs `filer secrets` internally and injects any credential findings as CRITICAL nodes.

```bash
filer scan                          # scan entire repo, open report when done
filer scan --scope backend/         # limit to a subdirectory
filer scan --parallel 4             # faster — 4 modules concurrently
filer scan --fast                   # use indexing model — cheaper, good for frequent scans
filer scan --parallel 4 --fast      # fastest: parallel + cheaper model
filer scan --output security.html   # custom output path
filer scan --ci --fail-on high      # CI mode — exit 1 on critical or high findings
```

The report groups findings by severity, links each node to its source scope, and shows verification status. Share it in PR reviews or run it in CI to track security coverage over time.

---

## filer review

```bash
filer review                        # generate pending.json + open HTML review UI
filer review --tty                  # interactive y/n verification in the terminal
filer review --unverified-only      # only nodes not yet approved
filer review --type security        # only security nodes
filer review --apply                # commit decisions from a reviewed pending.json
```

**For humans** — opens `.filer/review/report.html`. Click Approve / Reject / Amend per node. Export the reviewed `pending.json`, then run `filer review --apply`.

**For agents** — call `filer_review_pending` (MCP) to load the bundle, evaluate each node, then call `filer_review_apply` with decisions. Fully automated review loop — no human required for high-confidence nodes.

---

## filer pack

```bash
filer pack                                     # pack entire repo → stdout
filer pack --output context.md                 # write to file
filer pack --task "add payment webhook"        # LLM selects relevant files only
filer pack --tokens 40000                      # fit within token budget
filer pack --compress                          # strip comments + empty lines (~70% smaller)
filer pack --smart-compress                    # AST-aware — tree-sitter, language-aware
filer pack --format xml                        # XML output
filer pack --remote user/repo                  # pack a remote GitHub repo without cloning
filer pack --scope src/payments/               # one module
filer pack --annotate full                     # full annotations (default: summary)
filer pack --no-annotate                       # pure code dump, no knowledge layer
filer pack --stats                             # token counts per file, no output
filer pack --sort-by-changes --top-files 10    # most-changed files first
filer pack --include-git-log --include-git-diff  # add commit history + current diff
```

Every file in the output gets its Filer knowledge nodes prepended inline — constraints, dangers, and patterns attached to the code they govern, before an agent reads a single line.

`--task` uses the LLM to select only files relevant to what you're building. `--tokens` fills the budget intelligently — security nodes first, then most-changed files. Stale knowledge nodes are flagged in the preamble.

---

## filer export

```bash
filer export > FILER_CONTEXT.md                    # all nodes → stdout
filer export --type security,constraint > RULES.md # critical rules only
filer export --verified > VERIFIED.md              # only human-approved nodes
filer export --scope src/payments/ > PAYMENTS.md   # one module
filer export --output .filer/context.md            # write to file directly
```

Plain Markdown — any agent that can read a file can consume it. For Claude Code and Cursor, prefer the MCP server (`filer mcp`) which provides live, scope-filtered access instead of a static dump.

---

## filer layer — staleness check and speed flags

```bash
# Full build
filer layer                             # build or rebuild everything
filer layer --parallel 4                # 4 modules concurrently (recommended: 3–5)
filer layer --fast                      # use indexing model for all tasks
filer layer --parallel 4 --fast         # fastest combination
filer layer --cost                      # estimate API cost before running
filer layer --dry-run                   # show what would be indexed without writing

# Incremental update
filer layer --update                    # re-index changed files since last commit
filer layer --update --since HEAD~3     # re-index files changed in last 3 commits
filer layer --update --check-stale      # re-index + LLM staleness check
filer layer --update --silent           # suppress output (used by git post-commit hook)
```

`--update` compares file mtimes against node `updated_at` timestamps — only modules with newer files are sent to the LLM.

`--check-stale` pulls the git diff for each node's scope since the node was last updated and asks the LLM whether the diff invalidates the node's claim. Nodes confirmed stale get `stale_risk = 1.0` and surface in `filer review`. The flag is opt-in to keep the post-commit hook fast.

---

## filer agent

```bash
filer agent --event commit
filer agent --event pr_merged --pr 142 --auto-apply
filer agent --event ci --fail-on high
filer agent --event scheduled
filer agent --event scheduled --dry-run   # preview without executing
filer agent                               # ReAct loop — LLM decides what to do
```

| Event | What it does |
|-------|--------------|
| `commit` | `filer layer --update` — re-index changed files |
| `pr_merged` | `filer learn` — mine review comments for new nodes |
| `ci` | `filer scan --ci` — fail on high-severity findings |
| `scheduled` | `filer layer --update --check-stale` — nightly staleness check |

Without `--event`, the ReAct loop runs: LLM observes repo state, selects a tool, executes, reflects, repeats. Confidence gates autonomy: ≥ 0.85 auto-applies; < 0.85 queues to `pending.json`; security nodes always queue.

**GitHub Actions** — copy `templates/filer.yml` to `.github/workflows/filer.yml`. It auto-selects the event type from `github.event_name` and commits updated nodes back to the branch.

Audit log: `.filer/agent-log.md`.

---

## filer learn

```bash
filer learn                        # all merged PRs
filer learn --since 2026-01-01     # from a specific date
filer learn --pr 147               # single PR
filer learn --auto-apply           # apply nodes with confidence >= 0.85 without prompting
filer learn --dry-run              # preview proposals without writing
filer learn --from-file comments.txt  # GitLab/Bitbucket/Slack export
```

No GitHub token setup required. Filer resolves credentials automatically: env var → `.env` → `gh` CLI → GitHub OAuth Device Flow. The first time you run without a token, Filer opens your browser and walks you through authorization.

If an agent has to be told the same thing twice in code review, `filer learn` closes that gap.

---

## filer benchmark

```bash
filer benchmark                    # auto-detects scope, prompts for task
filer benchmark --scope backend/   # specify scope manually
filer benchmark --dry-run          # preview without making API calls
```

Runs identical tasks with and without Filer context, scores outputs with an LLM judge, and reports average score, token count, latency, and the lift delta from having Filer context loaded.

---

## Node types

| Type | Question it answers | Priority |
|------|---------------------|----------|
| `security` | What must never be exposed or bypassed? | Critical |
| `constraint` | What must this code never do? | Critical |
| `danger` | Where does this break non-obviously? | High |
| `assumption` | What does this silently rely on? | High |
| `antipattern` | What looks right but is wrong here? | High |
| `pattern` | What is the local coding dialect? | Medium |
| `intent` | What does this module own and not own? | Medium |
| `decision` | Why was this done this way? | Lower |

---

## LLM providers

| Provider | Models used | Env var |
|----------|-------------|---------|
| Anthropic *(default)* | Sonnet 4.6 (deep), Haiku 4.5 (indexing) | `ANTHROPIC_API_KEY` |
| OpenAI | GPT-4o (deep), GPT-4o-mini (indexing) | `OPENAI_API_KEY` |
| Kimi | kimi-k2.6 (256K context, ~80% cheaper than Sonnet) | `MOONSHOT_API_KEY` |
| Ollama | llama3.3 or any local model | *(none)* |

Switch provider: `filer init --provider kimi --force`

Sign up for Kimi at [platform.moonshot.ai](https://platform.moonshot.ai).

---

## The quality bar

Zero nodes is better than wrong nodes.

An agent that loads a Filer node trusts it. A wrong constraint is worse than no constraint — it actively misleads. Filer enforces a minimum confidence of 0.75 on every node and requires human verification for security nodes. Use `filer review --tty` to interactively approve or reject LLM-inferred nodes before they are trusted.

---

## Contributing

Filer is MIT licensed. The highest-value contributions are:

**Extraction prompts** — output quality depends entirely on `src/llm/prompts.ts`. Better prompts for specific languages, frameworks, or domains are the most impactful change you can make.

**Templates** — add a JSON file to `templates/<category>/`, update `templates/manifest.json`, ensure `npm test` passes. See [`templates/README.md`](./templates/README.md) for the format.

**Node schema** — 8 node types cover the most common patterns. If you encounter knowledge that doesn't fit, open an issue.

**Language support** — prompts are tuned for TypeScript and Python. PRs for Go, Rust, Java, Ruby, and others are welcome.

```bash
git clone https://github.com/dkeswani/filer.git
cd filer
npm install
npm test          # 194 tests — all must pass before and after your change
npx tsc --noEmit  # TypeScript must be clean
```

---

## Why this exists

Every codebase contains two things: instructions for a computer, and the accumulated knowledge of every person who ever worked on it. The first part is perfectly readable by machines. The second part is almost completely invisible — buried in commit messages, PR discussions, Slack threads, and people's memories.

When an AI agent starts a session, it has the first part. It has almost none of the second. Filer brings the second part inside the repo, structures it for machine consumption, and makes it available to every agent that works on the codebase — from day one, forever.

The README told you how to run the code. Filer tells agents how to understand it.

---

## License

MIT — use it, modify it, embed it. No restrictions.

---

*Built by [@dkeswani](https://github.com/dkeswani)*
