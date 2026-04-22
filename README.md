# Filer

**The knowledge layer for codebases.**

Filer extracts the institutional knowledge locked inside your codebase — constraints, patterns, dangers, security rules, decisions, antipatterns — and makes it available to AI coding agents as structured context before they write a single line of code.

Without Filer, every agent session starts from zero. The agent reads code, guesses at conventions, misses invisible rules, and produces output that fails code review. With Filer, agents start informed — they know what this codebase must never do, where it breaks non-obviously, what patterns the team follows, and what has been tried and failed.

The result: fewer revision cycles, fewer "we don't do it this way here" review comments, and agents that write code that fits.

---

## Get Started in One Command

```bash
cd your-repo
npx @filer/cli@latest
```

No install required. The interactive wizard guides you through everything in one session:

1. **Detects your project type** — Next.js, Python/FastAPI, Express, Go, Rust, TypeScript, JavaScript
2. **Asks which LLM provider** — Anthropic (default), OpenAI, Kimi, or local Ollama
3. **Handles your API key** — reads from environment, or prompts and saves it securely to `.env`
4. **Shows a cost estimate** with a 5-second countdown before any API calls (Ctrl+C to cancel)
5. **Builds the knowledge layer** — scans your code, extracts nodes, shows live progress
6. **Highlights the top finding** — most critical security issue, or highest-confidence constraint

When the wizard finishes, your repo has a committed `.filer/` directory and a `filer.md` that tells agents how to load it.

---

## What the Wizard Produces

```
your-repo/
├── filer.md              ← agent instructions (read this first)
├── .claude/
│   └── mcp.json          ← MCP server config for Claude Code / Cursor
└── .filer/
    ├── index.json        ← master manifest of all nodes
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

## Wire It Into Your Agent

After the wizard runs, add one line to your `CLAUDE.md`, `AGENTS.md`, or `.cursorrules`:

```markdown
Before writing any code, read filer.md in the repo root and follow the Filer loading protocol.
```

**For Claude Code**, `.claude/mcp.json` is written automatically by the wizard — the Filer MCP server is immediately available as tools during agent sessions with no further setup.

---

## Daily Usage

```bash
filer pack                           # pack repo → stdout (replaces repomix/codebase-digest)
filer pack --task "add webhook"      # smart: only relevant files + knowledge annotations
filer pack --tokens 40000            # fit within token budget
filer pack --remote user/repo        # pack a remote GitHub repo
filer stats                          # coverage dashboard
filer export > FILER_CONTEXT.md      # dump all nodes as Markdown — paste into any agent
filer export --type security,constraint > CRITICAL_RULES.md
filer review                         # generate review bundle + HTML UI for humans or agents
filer verify                         # interactive y/n node verification
filer query "your question"          # ask the knowledge layer anything
filer show --type security           # view all security nodes
filer update                         # re-index after manual file changes
filer update --check-stale           # re-index + LLM staleness check on high-risk nodes
filer learn                          # propose new nodes from PR review history
filer scan                           # full security scan → HTML report
filer scan --ci --fail-on high       # CI mode — exit 1 on critical/high findings
filer agent --event commit           # run as post-push CI step
filer agent --event scheduled --dry-run  # preview what nightly agent would do
```

The git post-commit hook installed by `filer init` runs `filer update` automatically after every commit. The knowledge layer stays current without manual work.

---

## All Commands

### Core

| Command | Description |
|---------|-------------|
| `filer` | Run the setup wizard (first time) or show stats dashboard (already initialized) |
| `filer init [options]` | Initialize without the wizard |
| `filer index [options]` | Build or rebuild the full knowledge layer |
| `filer update [options]` | Incremental re-index from last git commit |
| `filer stats` | Coverage and freshness dashboard |

`filer init` options: `--provider anthropic|openai|kimi|ollama`, `--model <name>`, `--no-hook`, `--force`
`filer index` options: `--scope <path>`, `--type <types>`, `--force`, `--dry-run`, `--cost`, `--parallel <n>`, `--fast`
`filer update` options: `--since <git-ref>`, `--silent`, `--check-stale`

---

### Scanning & Reporting

| Command | Description |
|---------|-------------|
| `filer scan [options]` | Run a full security scan and generate an HTML report |
| `filer layer [options]` | Build the agent knowledge layer (alias for `filer index`) |

`filer scan` options: `--output <path>` (default `.filer/report.html`), `--scope <path>`, `--parallel <n>`, `--fast`, `--open`, `--force`, `--ci`, `--fail-on <severity>`
`filer layer` options: same as `filer index`

---

### Packing & Context

| Command | Description |
|---------|-------------|
| `filer pack [options]` | Pack codebase into AI-ready context — replaces repomix + codebase-digest, adds knowledge annotations |

`filer pack` options: `--scope <path>`, `--task <description>`, `--tokens <n>`, `--annotate summary\|full\|none`, `--compress`, `--format markdown\|xml\|json\|plain`, `--remote <url>`, `--branch <name>`, `--include <globs>`, `--ignore <globs>`, `--sort-by-changes`, `--include-git-log`, `--include-git-diff`, `--split <size>`, `--line-numbers`, `--top-files <n>`, `--stats`, `--output <file>`, `--copy`, `--no-gitignore`, `--no-instructions`

---

### Exploration

| Command | Description |
|---------|-------------|
| `filer show [id]` | Display one or all nodes |
| `filer export` | Export all nodes as a Markdown file — paste into any agent context window |
| `filer query "<question>"` | Ask a natural language question — returns LLM-synthesized answer with node citations |
| `filer verify` | Interactive y/n verification workflow |
| `filer review [options]` | Generate a machine-readable review bundle + HTML report for human or agent review |

`filer show` options: `--type <types>`, `--scope <path>`, `--verified`, `--json`
`filer export` options: `--type <types>`, `--scope <path>`, `--verified`, `--output <path>`, `--no-header`
`filer query` options: `--scope <path>`, `--type <types>`, `--no-llm` (skip synthesis, return matched nodes only), `--json`
`filer verify` options: `--type <types>`, `--stale`, `--unverified-only`
`filer review` options: `--type <types>`, `--stale`, `--unverified-only`, `--apply`, `--output <path>`, `--no-open`

---

### Git Hook

| Command | Description |
|---------|-------------|
| `filer hook install` | Install git post-commit hook for automatic updates |
| `filer hook uninstall` | Remove the hook |
| `filer hook status` | Check hook installation state |

---

### Agent

| Command | Description |
|---------|-------------|
| `filer agent --event <type>` | Event-driven orchestrator — maps git/CI events to the right command sequence |

`filer agent` options: `--event commit\|pr_merged\|ci\|scheduled`, `--pr <number>`, `--since <ref>`, `--auto-apply`, `--dry-run`, `--fail-on <severity>`

---

### Learning & Measurement

| Command | Description |
|---------|-------------|
| `filer learn` | Mine PR review comments from GitHub and propose new knowledge nodes |
| `filer measure` | Compute productivity metrics from GitHub PR history |
| `filer benchmark` | Score LLM responses with vs. without Filer context loaded |

`filer learn` options: `--since <date>`, `--pr <number>`, `--auto-apply`, `--dry-run`
`filer measure` options: `--since <date>`, `--before <date>`, `--before-after <date>`, `--pr <number>`
`filer benchmark` options: `--scope <path>`, `--task <name>`, `--runs <n>`, `--dry-run`

---

### MCP Server

| Command | Description |
|---------|-------------|
| `filer mcp` | Start the MCP server (stdio transport) for Claude Code / Cursor |

The MCP server exposes eight tools: `filer_scope`, `filer_query`, `filer_node`, `filer_stats`, `filer_check`, `filer_pack`, `filer_review_pending`, `filer_review_apply`. Claude Code loads these automatically from `.claude/mcp.json`.

---

## filer scan

`filer scan` runs a full security-focused extraction pass and writes a self-contained HTML report to `.filer/report.html`.

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

`filer review` makes node verification one command — producing a machine-readable bundle for agents and a simple HTML UI for humans.

```bash
filer review                        # generate pending.json + open HTML review UI
filer review --unverified-only      # only nodes not yet approved
filer review --type security        # only security nodes
filer review --apply                # commit decisions from a reviewed pending.json
```

**For humans** — opens `.filer/review/report.html` in your browser. Click Approve / Reject / Amend per node. Batch-approve all visible items at once. Export the reviewed `pending.json`, then run `filer review --apply`.

**For agents** — call `filer_review_pending` (MCP) to load the bundle, evaluate each node against the codebase, then call `filer_review_apply` with your decisions. Fully automated review loop — no human required for high-confidence nodes.

The review bundle lives at `.filer/review/pending.json`:

```json
{
  "generated_at": "...",
  "repo": "my-repo",
  "review_items": [
    {
      "id": "security:no-raw-sql",
      "type": "security",
      "severity": "CRITICAL",
      "status": "pending",
      "node": { "...full node..." },
      "confidence": 0.94,
      "requires_human": true,
      "review_comment": null
    }
  ]
}
```

---

## Replacing Repomix and Codebase Digest

`filer pack` is a full drop-in replacement for both tools. Every flag you use today has an equivalent:

| repomix / codebase-digest | filer pack |
|---------------------------|------------|
| `repomix` | `filer pack` |
| `repomix --output out.xml --style xml` | `filer pack --output out.xml --format xml` |
| `repomix --compress` | `filer pack --compress` |
| `repomix --include "src/**"` | `filer pack --include "src/**"` |
| `repomix --ignore "*.test.ts"` | `filer pack --ignore "*.test.ts"` |
| `repomix --remote user/repo` | `filer pack --remote user/repo` |
| `repomix --no-gitignore` | `filer pack --no-gitignore` |
| `codebase-digest --max-tokens 40000` | `filer pack --tokens 40000` |
| `codebase-digest --output-file ctx.md` | `filer pack --output ctx.md` |
| *(not available)* | `filer pack --task "add payment webhook"` |
| *(not available)* | knowledge annotations per file |
| *(not available)* | stale node warnings in preamble |
| *(not available)* | `filer_pack` MCP tool for agents |

**Migration:** replace `repomix` or `codebase-digest` with `filer pack` in your scripts. Flags are compatible. The output gains knowledge annotations automatically if `.filer/` is initialized — use `--no-annotate` to get the same plain output as before.

---

## filer pack

`filer pack` replaces repomix and codebase-digest — full feature parity plus four capabilities they don't have.

```bash
filer pack                                     # pack entire repo → stdout
filer pack --output context.md                 # write to file
filer pack --task "add payment webhook"        # smart: LLM selects relevant files only
filer pack --tokens 40000                      # fit within token budget
filer pack --compress                          # strip comments + empty lines (~70% smaller)
filer pack --format xml                        # XML output (repomix compatible)
filer pack --remote user/repo                  # pack a remote GitHub repo without cloning
filer pack --scope src/payments/               # one module
filer pack --annotate full                     # full knowledge annotations (default: summary)
filer pack --no-annotate                       # pure code dump, no knowledge layer
filer pack --stats                             # token counts per file, no output
filer pack --sort-by-changes --top-files 10    # most-changed files first
filer pack --include-git-log --include-git-diff  # add commit history + current diff
```

**What makes it 100x smarter than repomix:**

Every file in the output gets its Filer knowledge nodes prepended inline — the agent sees constraints, dangers, and patterns attached to the code they govern, before reading a single line:

```
// ═══════════════════════════════════════════════════
// FILER KNOWLEDGE — src/payments/webhook.ts
// ═══════════════════════════════════════════════════
// [FILER 🔴 SECURITY ✓] (94% conf) security:no-raw-webhook-logging
//   Rule: Never log raw webhook payloads — contains PII
//   If violated: PII exposure, GDPR breach
//
// [FILER 🟡 CONSTRAINT] (88% conf) constraint:verify-stripe-sig
//   Rule: Always verify Stripe signature before processing
// ═══════════════════════════════════════════════════

export async function handleWebhook(req, res) { ...
```

`--task` mode uses the LLM to select only the files relevant to what you're building. `--tokens` fills the budget intelligently — security nodes first, then most-changed files. Stale knowledge nodes are flagged in the preamble so the agent knows before it starts.

The `filer_pack` MCP tool exposes all of this to agents directly — no CLI required.

---

## filer export

`filer export` dumps all knowledge nodes as a single Markdown file. For teams not using MCP — paste it into any agent's context window, commit it alongside the code, or include it in your `AGENTS.md`.

```bash
filer export > FILER_CONTEXT.md                    # all nodes → stdout
filer export --type security,constraint > RULES.md # critical rules only
filer export --verified > VERIFIED.md              # only human-approved nodes
filer export --scope src/payments/ > PAYMENTS.md   # one module
filer export --output .filer/context.md            # write to file directly
```

The output is plain Markdown — no build step, no MCP server required. Any agent that can read a file can consume it. For Claude Code and Cursor, prefer the MCP server (`filer mcp`) which provides live, scope-filtered access instead of a static dump.

---

## filer update — staleness check

`filer update --check-stale` runs an LLM-powered staleness verification pass after re-indexing. For each node above the stale threshold, it pulls the git diff for that node's scope since the node was last updated, and asks the LLM whether the diff invalidates the node's claim.

```bash
filer update                   # re-index changed files (fast, no LLM staleness check)
filer update --check-stale     # re-index + LLM staleness check on high-risk nodes
```

Nodes confirmed stale get `stale_risk = 1.0` and `verified = false`, surfacing them in `filer review`. Nodes the LLM clears get `stale_risk` lowered. The flag is opt-in to keep the git post-commit hook fast and free — use it manually or in CI.

---

## filer index — speed flags

Two flags make indexing faster for large repos:

```bash
filer index --parallel 4    # process 4 modules concurrently (recommended: 3–5)
filer index --fast          # use indexing model (Haiku/kimi-k2.6) for all tasks
filer index --parallel 4 --fast   # fastest: parallel + cheaper model
filer index --cost          # estimate API cost before running anything
```

`--parallel` increases throughput at the cost of higher API rate-limit exposure. `--fast` uses the cheaper indexing model for all modules instead of routing deep tasks to the more capable model — good for frequent incremental re-indexes.

---

## filer agent

`filer agent` is a self-hostable, zero-dependency agent loop that keeps the knowledge layer up to date automatically. It responds to four event types and maps each to the right command sequence:

| Event | Trigger | What it does |
|-------|---------|--------------|
| `commit` | post-push | `filer update` — re-index changed files |
| `pr_merged` | PR closed | `filer learn` — mine review comments for new nodes |
| `ci` | CI run | `filer scan --ci` — fail on high-severity findings |
| `scheduled` | nightly | `filer update --check-stale` — LLM staleness check |

```bash
# Run manually
filer agent --event commit
filer agent --event pr_merged --pr 142 --auto-apply
filer agent --event ci --fail-on high
filer agent --event scheduled

# Preview without executing
filer agent --event scheduled --dry-run
# → Would run: filer update --check-stale
# → Would surface: unverified nodes in .filer/review/pending.json
```

**GitHub Actions** — copy `templates/filer.yml` from this repo to `.github/workflows/filer.yml`. It auto-selects the right event type based on `github.event_name` and commits updated `.filer/` nodes back to the branch.

The agent is fully open source, ships in `@filer/cli`, and has zero dependencies beyond what Filer already uses. No external framework, no commercial service. All reasoning uses the same `LLMGateway` that powers the rest of Filer. Audit log is written to `.filer/agent-log.md`.

---

## filer learn

`filer learn` closes the feedback loop between code review and the knowledge layer.

It fetches PR review comments from GitHub, classifies each one as an institutional knowledge signal ("we don't do it this way here") vs. a routine technical correction, clusters similar signals across PRs, cross-references against existing `.filer/` nodes, and proposes new or updated nodes. You review each proposal with its evidence chain and apply or skip.

```bash
filer learn                        # all merged PRs
filer learn --since 2026-01-01     # from a specific date
filer learn --pr 147               # single PR
filer learn --auto-apply           # apply nodes with confidence >= 0.85 without prompting
filer learn --dry-run              # preview proposals without writing
```

No `GITHUB_TOKEN` setup required. Filer resolves credentials automatically: env var → `.env` file → `gh` CLI → GitHub OAuth Device Flow. The first time you run `filer learn` without a token, Filer opens your browser and walks you through authorization. The token is saved to `.env`.

If an agent has to be told the same thing twice in code review, `filer learn` closes that gap.

---

## filer benchmark

`filer benchmark` quantifies Filer's impact on code quality by running identical tasks with and without Filer context, then scoring outputs with an LLM judge.

```bash
filer benchmark                    # auto-detects scope, prompts for task
filer benchmark --scope backend/   # specify scope manually
filer benchmark --dry-run          # preview without making API calls
```

Reports avg score, token count, and latency for each variant, plus a delta score showing the lift from Filer context.

---

## Node Types

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

## LLM Providers

| Provider | Models used | Env var |
|----------|-------------|---------|
| Anthropic *(default)* | Sonnet 4.6 (deep), Haiku 4.5 (indexing) | `ANTHROPIC_API_KEY` |
| OpenAI | GPT-4o (deep), GPT-4o-mini (indexing) | `OPENAI_API_KEY` |
| Kimi | kimi-k2.6 (256K context, ~80% cheaper than Sonnet) | `MOONSHOT_API_KEY` |
| Ollama | llama3.3 or any local model | *(none)* |

Switch provider: `filer init --provider kimi --force`

Sign up for Kimi at [platform.moonshot.ai](https://platform.moonshot.ai).

---

## The Quality Bar

Zero nodes is better than wrong nodes.

An agent that loads a Filer node trusts it. A wrong constraint is worse than no constraint — it actively misleads. Filer enforces a minimum confidence of 0.75 on every node and requires human verification for security nodes. Use `filer verify` to review and approve LLM-inferred nodes before they are trusted.

---

## Contributing

Filer is MIT licensed. The highest-value contributions are:

**Extraction prompts** — output quality depends entirely on `src/llm/prompts.ts`. Better prompts for specific languages, frameworks, or domains are the most impactful change you can make.

**Node schema** — 8 node types cover the most common patterns. If you encounter knowledge that doesn't fit, open an issue.

**Language support** — prompts are tuned for TypeScript and Python. PRs for Go, Rust, Java, Ruby, and others are welcome.

```bash
git clone https://github.com/dkeswani/filer.git
cd filer
npm install
npm test          # 168 tests — all must pass before and after your change
npx tsc --noEmit  # TypeScript must be clean
```

---

## Why This Exists

Every codebase contains two things: instructions for a computer, and the accumulated knowledge of every person who ever worked on it. The first part is perfectly readable by machines. The second part is almost completely invisible — buried in commit messages, PR discussions, Slack threads, and people's memories.

When an AI agent starts a session, it has the first part. It has almost none of the second. Filer brings the second part inside the repo, structures it for machine consumption, and makes it available to every agent that works on the codebase — from day one, forever.

The README told you how to run the code. Filer tells agents how to understand it.

---

## License

MIT — use it, modify it, embed it. No restrictions.

---

*Built by [@dkeswani](https://github.com/dkeswani)*
