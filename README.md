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
filer stats                          # coverage dashboard
filer verify                         # review and approve extracted nodes
filer query "your question"          # ask the knowledge layer anything
filer show --type security           # view all security nodes
filer update                         # re-index after manual file changes
filer learn                          # propose new nodes from PR review history
filer scan                           # full security scan → HTML report
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
`filer update` options: `--since <git-ref>`, `--silent`

---

### Scanning & Reporting

| Command | Description |
|---------|-------------|
| `filer scan [options]` | Run a full security scan and generate an HTML report |
| `filer layer [options]` | Build the agent knowledge layer (alias for `filer index`) |

`filer scan` options: `--output <path>` (default `.filer/report.html`), `--scope <path>`, `--parallel <n>`, `--open`, `--force`
`filer layer` options: same as `filer index`

---

### Exploration

| Command | Description |
|---------|-------------|
| `filer show [id]` | Display one or all nodes |
| `filer query "<question>"` | Ask a natural language question — returns LLM-synthesized answer with node citations |
| `filer verify` | Interactive y/n verification workflow |

`filer show` options: `--type <types>`, `--scope <path>`, `--verified`, `--json`
`filer query` options: `--scope <path>`, `--type <types>`, `--no-llm` (skip synthesis, return matched nodes only), `--json`
`filer verify` options: `--type <types>`, `--stale`, `--unverified-only`

---

### Git Hook

| Command | Description |
|---------|-------------|
| `filer hook install` | Install git post-commit hook for automatic updates |
| `filer hook uninstall` | Remove the hook |
| `filer hook status` | Check hook installation state |

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

The MCP server exposes five tools: `filer_scope`, `filer_query`, `filer_node`, `filer_stats`, `filer_check`. Claude Code loads these automatically from `.claude/mcp.json`.

---

## filer scan

`filer scan` runs a full security-focused extraction pass and writes a self-contained HTML report to `.filer/report.html`.

```bash
filer scan                          # scan entire repo, open report when done
filer scan --scope backend/         # limit to a subdirectory
filer scan --parallel 4             # faster — 4 modules concurrently
filer scan --output security.html   # custom output path
```

The report groups findings by severity, links each node to its source scope, and shows verification status. Share it in PR reviews or run it in CI to track security coverage over time.

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
