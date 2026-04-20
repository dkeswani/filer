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

No install needed. The wizard runs automatically and guides you through everything:

1. **Detects your project type** — Next.js, Python/FastAPI, Express, Go, Rust, TypeScript, and more
2. **Asks which LLM provider** — Anthropic (default), OpenAI, or local Ollama
3. **Handles your API key** — finds it in your environment, or prompts and saves it to `.env`
4. **Shows a cost estimate** — with a 5-second countdown before any API calls are made (Ctrl+C to cancel)
5. **Builds the knowledge layer** — scans your code, extracts nodes, shows live progress
6. **Highlights the top finding** — the most important thing it found (critical security issues first)

When the wizard finishes, your repo has a `.filer/` directory committed alongside your code, and a `filer.md` that tells agents how to load it.

---

## What the Wizard Produces

```
your-repo/
├── src/
├── filer.md              ← agent instructions (load this first)
└── .filer/
    ├── index.json        ← master manifest
    ├── constraint/       ← what this code must never do
    ├── danger/           ← where it breaks non-obviously
    ├── security/         ← what must never be exposed or bypassed
    ├── antipattern/      ← what looks right but is wrong here
    ├── pattern/          ← the local dialect
    ├── assumption/       ← what the code silently relies on
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

That's the entire integration. The agent reads `filer.md`, loads the nodes relevant to the files it's about to touch, and starts informed.

**For Claude Code specifically**, the wizard also writes `.claude/mcp.json` so the Filer MCP server is available as tools during agent sessions — no manual setup needed.

---

## After the Wizard

```bash
filer stats                    # coverage dashboard — how much of your code is covered
filer verify                   # review and approve extracted nodes interactively
filer query "your question"    # ask a natural language question about the codebase
filer show --type security     # view all security nodes
filer learn                    # mine PR review comments to propose new nodes
```

Filer installs a git post-commit hook during `init`. After each commit, `filer update` runs automatically and re-indexes changed files. The knowledge layer stays current without manual work.

---

## All Commands

| Command | Description |
|---------|-------------|
| `filer` | Run the setup wizard (first time) or show stats (subsequent runs) |
| `filer init` | Initialize without the wizard |
| `filer index` | Build or rebuild the full knowledge layer |
| `filer update` | Incremental update from last git commit |
| `filer stats` | Coverage and freshness dashboard |
| `filer show [id]` | Display knowledge nodes — filter by `--type`, `--scope`, `--verified` |
| `filer query "<question>"` | Keyword match + LLM-synthesized answer with node citations |
| `filer verify` | Interactive y/n verification workflow |
| `filer hook install\|uninstall\|status` | Manage git post-commit hook |
| `filer learn` | Learn from PR review comments, propose new nodes |
| `filer measure` | Compute productivity metrics from GitHub PR history |
| `filer benchmark` | Score LLM responses with vs. without Filer context |
| `filer mcp` | Start MCP server (stdio) for Claude Code / Cursor |

---

## LLM Providers

| Provider | Models | Env Var |
|----------|--------|---------|
| Anthropic *(default)* | claude-sonnet-4-6, claude-haiku-4-5 | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-4o, gpt-4o-mini | `OPENAI_API_KEY` |
| Ollama | llama3.3, any local model | *(none)* |

Switch provider at any time by re-running `filer init --provider openai`.

---

## Node Types

Filer extracts 8 types of knowledge, each answering a different question an agent needs before coding:

| Type | Question it answers | Priority |
|------|---------------------|----------|
| `security` | What must never be exposed or bypassed? | Critical |
| `constraint` | What must this code never do? | Critical |
| `danger` | Where does this break non-obviously? | High |
| `assumption` | What does this silently rely on? | High |
| `antipattern` | What looks right but is wrong here? | High |
| `pattern` | What is the local dialect? | Medium |
| `intent` | What does this module own and not own? | Medium |
| `decision` | Why was this done this way? | Lower |

---

## The Learning Loop

`filer learn` closes the feedback loop between code review and the knowledge layer.

It fetches PR review comments from GitHub, classifies each one as an institutional knowledge signal ("we don't do it this way here") vs. a technical correction, clusters similar signals across PRs, and proposes new or updated nodes. You review each proposal with its evidence chain and apply or skip.

```bash
filer learn                       # scan all merged PRs
filer learn --since 2026-01-01    # from a specific date
filer learn --pr 147              # single PR
filer learn --auto-apply          # apply high-confidence nodes without review
```

Requires `GITHUB_TOKEN` in your environment.

If an agent has to be told the same thing twice in code review, Filer failed. `filer learn` closes that gap.

---

## The Quality Bar

Zero nodes is better than wrong nodes.

An agent that loads a Filer node trusts it. A wrong constraint is worse than no constraint — it actively misleads. Filer enforces a minimum confidence threshold (0.75) on every node and requires human verification for security nodes. The `filer verify` command provides an interactive workflow for reviewing LLM-inferred nodes.

---

## Contributing

Filer is MIT licensed. Contributions are welcome across three areas:

**Extraction prompts** — The quality of output depends entirely on the prompts in `src/llm/prompts.ts`. Better prompts for specific languages, frameworks, or domains are the highest-value contribution.

**Node schema** — The 8 node types cover the most common patterns. If you encounter knowledge that doesn't fit, open an issue.

**Language support** — Prompts are tuned for TypeScript and Python. PRs adding variants for Go, Rust, Java, Ruby, and others are welcome.

```bash
git clone https://github.com/dkeswani/filer.git
cd filer
npm install
npm test          # 146 tests — all must pass before and after your change
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
