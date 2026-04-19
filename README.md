# Filer

**The knowledge layer for codebases.**

Filer extracts the institutional knowledge locked inside your codebase — constraints, patterns, dangers, security rules, decisions, antipatterns — and makes it available to AI coding agents as structured context before they write a single line of code.

Without Filer, every agent session starts from zero. The agent reads code, guesses at conventions, misses invisible rules, and produces output that fails code review. With Filer, agents start informed — they know what this codebase must never do, where it breaks non-obviously, what patterns the team follows, and what has been tried and failed.

The result: fewer revision cycles, fewer "we don't do it this way here" review comments, and agents that write code that fits.

---

## How It Works

Filer reads your source code and uses an LLM to extract structured knowledge nodes into a `.filer/` directory committed alongside your code. A `filer.md` file in your repo root tells AI agents how to load and use this context.


your-repo/
├── src/
├── filer.md          ← agent instructions (load this first)
└── .filer/
├── index.json    ← master manifest
├── constraint/   ← what this code must never do
├── danger/       ← where it breaks non-obviously
├── security/     ← what must never be exposed or bypassed
├── antipattern/  ← what looks right but is wrong here
├── pattern/      ← the local dialect
├── assumption/   ← what the code silently relies on
├── intent/       ← what each module owns and does not own
└── decision/     ← why non-obvious choices were made

The `.filer/` directory is committed to the repo. Every developer, every agent, every CI run starts with the same accumulated knowledge.

---

## Quickstart

```bash
npm install -g @filer/cli
```

**Initialize Filer in your repo:**

```bash
cd your-repo
filer init
```

**Build the knowledge layer:**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
filer index
```

**Add the agent instruction to your CLAUDE.md, AGENTS.md, or .cursorrules:**

```markdown
## Filer Knowledge Layer

Before writing any code, read filer.md in the repo root and follow
the Filer loading protocol.
```

**Check coverage:**

```bash
filer stats
```

---

## Commands

| Command | Description |
|---------|-------------|
| `filer init` | Initialize Filer in the current repository |
| `filer index` | Build the full knowledge layer from your codebase |
| `filer update` | Incremental update from last git commit |
| `filer stats` | Coverage and freshness dashboard |
| `filer show` | Display knowledge nodes |
| `filer query "question"` | Ask a natural language question about the codebase |
| `filer verify` | Interactive human verification workflow |
| `filer hook install` | Install git post-commit hook for auto-updates |
| `filer learn` | Learn from PR review comments *(coming soon)* |

---

## LLM Providers

Filer works with any capable LLM. Configure via `filer init`:

| Provider | Models | Setup |
|----------|--------|-------|
| Anthropic | claude-sonnet-4-6, claude-haiku | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-4o, gpt-4o-mini | `OPENAI_API_KEY` |
| Ollama | llama3.3, any local model | No key needed |

---

## Node Types

Filer extracts 8 types of knowledge, each answering a different question an agent needs before coding:

| Type | Question | Priority |
|------|----------|----------|
| `security` | What must never be exposed or bypassed? | Critical |
| `constraint` | What must this code never do? | Critical |
| `danger` | Where does this break non-obviously? | High |
| `assumption` | What does this silently rely on? | High |
| `antipattern` | What looks right but is wrong here? | High |
| `pattern` | What is the local dialect? | Medium |
| `intent` | What does this module own and not own? | Medium |
| `decision` | Why was this done this way? | Lower |

---

## The Quality Bar

Zero nodes is better than wrong nodes.

An agent that loads a Filer node trusts it. A wrong constraint is worse than no constraint — it actively misleads. Filer enforces a minimum confidence threshold on every node and requires human verification for security nodes. The `filer verify` command provides an interactive workflow for reviewing LLM-inferred nodes before they are trusted.

---

## The Learning Loop

Filer gets smarter with every code review cycle. `filer learn` reads PR review comments from GitHub, identifies patterns like "we don't do it this way here", and proposes new or updated knowledge nodes. If an agent has to be told the same thing twice, Filer failed — `filer learn` closes that gap.

*(Coming in v1.1)*

---

## Contributing

Filer is MIT licensed and built for the community. Contributions are welcome across three areas:

**Extraction prompts** — The quality of Filer's output depends entirely on the extraction prompts in `src/llm/prompts.ts`. Better prompts for specific languages, frameworks, or domains are the highest-value contribution. If Filer produces low-quality nodes for your stack, improve the prompt and submit a PR.

**Node schema** — The 8 node types cover the most common knowledge patterns. If you encounter knowledge that doesn't fit any existing type, open an issue describing what you're trying to capture and why it matters for agents.

**Language support** — The schema is language-agnostic but the extraction prompts are tuned for TypeScript and Python. PRs adding prompt variants for Go, Rust, Java, Ruby, and other languages are welcome.

**To contribute:**

```bash
git clone https://github.com/dkeswani/filer.git
cd filer
npm install
npm test          # 68 tests — all should pass before and after your change
npx tsc --noEmit  # TypeScript must be clean
```

Open a PR with a clear description of what you changed and why. For prompt improvements, include before/after examples of node output on a real codebase.

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