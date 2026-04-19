# Filer

**Filer is the knowledge layer for codebases — structured context for AI agents.**

AI agents write better code when they know the invisible rules: the constraint that can't be expressed in the type system, the danger that's burned three engineers, the pattern your team agreed on two years ago. Filer extracts that knowledge from your code and stores it in a structured, queryable format that agents load before every session.

---

## Quickstart (5 minutes)

### 1. Install

```bash
npm install -g @filer/cli
```

### 2. Initialize your repo

```bash
cd your-repo
filer init
```

This creates `.filer/`, writes `filer.md`, installs a git post-commit hook, and generates `.claude/mcp.json` for Claude Code / Cursor.

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Build the knowledge layer

```bash
filer index
```

Filer scans your source files, groups them into modules, and extracts up to 8 node types per module using Claude. Extraction takes 2–10 minutes depending on repo size.

### 4. Load context before coding sessions

Add this to your `CLAUDE.md` (or equivalent agent config):

```markdown
## Before writing any code

Read `filer.md` in this repository. It contains instructions for loading
the Filer knowledge layer — constraints, dangers, security rules, and patterns
specific to this codebase.
```

### 5. Use the MCP server (Claude Code / Cursor)

`.claude/mcp.json` is written by `filer init`:

```json
{
  "mcpServers": {
    "filer": {
      "command": "filer",
      "args": ["mcp"]
    }
  }
}
```

Once registered, agents can call `filer_scope`, `filer_query`, `filer_node`, `filer_stats`, and `filer_check` directly during coding sessions without manually reading files.

---

## How agents load context

The `filer.md` file written to your repo root tells agents exactly what to load:

1. Read `.filer/index.json` — lists all nodes with scope and summary
2. Filter nodes by `scope` matching the files you will touch
3. Load **all** `security` nodes in scope — absolute rules, never violate
4. Load **all** `constraint` nodes in scope — hard architectural boundaries
5. Load `danger` nodes — known non-obvious failure modes
6. Load `assumption` nodes for modules you call or import from
7. Load `pattern` nodes to understand the local coding dialect
8. Load `antipattern` nodes — approaches that look right but are wrong here

---

## Node type reference

| Type | Priority | What it captures |
|---|---|---|
| `security` | CRITICAL | Rules that must never be violated — auth, data exposure, secrets, compliance |
| `constraint` | CRITICAL | Hard architectural boundaries enforced by convention, not the type system |
| `danger` | HIGH | Non-obvious failure modes — silent failures, race conditions, historical bugs |
| `assumption` | HIGH | Implicit dependencies a caller could violate without knowing it |
| `antipattern` | HIGH | Approaches that look correct but are specifically wrong in this codebase |
| `pattern` | MEDIUM | The local dialect — how this codebase solves recurring problems |
| `intent` | MEDIUM | What a module owns and explicitly does not own |
| `decision` | LOW | Why a non-obvious architectural choice was made, with rejected alternatives |

Every node has: `id`, `type`, `scope`, `confidence`, `tags`, `verified`, `stale_risk`, `related`.

---

## Commands

```bash
filer init                              # Initialize Filer in the current repo
filer index                             # Full LLM extraction — builds the knowledge layer
filer update                            # Incremental update from last git commit
filer stats                             # Coverage dashboard
filer show [id]                         # Display nodes (filter by --type, --scope, --verified)
filer query "<question>"                # Keyword match + LLM-synthesized answer with citations
filer verify                            # Interactive y/n verification workflow
filer hook install|uninstall|status     # Manage git post-commit hook
filer learn                             # Learn from PR review comments (requires GITHUB_TOKEN)
filer measure                           # Compute productivity metrics from GitHub PRs
filer benchmark                         # Score LLM responses with/without Filer context
filer mcp                               # Start MCP server (stdio) for Claude Code / Cursor
```

---

## filer learn

`filer learn` closes the loop: it mines your PR review history and turns reviewer feedback into new knowledge nodes.

```bash
filer learn                        # Scan all merged PRs
filer learn --since 2026-01-01     # Only PRs merged after this date
filer learn --pr 147               # Single PR
filer learn --auto-apply           # Apply nodes with confidence >= 0.85 without prompting
filer learn --dry-run              # Preview proposals without writing anything
```

Requires `GITHUB_TOKEN` with `repo` scope.

**How it works:**

1. Fetches PR review comments from GitHub
2. Classifies each comment as institutional knowledge signal or technical correction (Haiku)
3. Clusters similar signals across PRs by keyword similarity
4. Cross-references clusters against existing `.filer/` nodes — new vs. update
5. Proposes new or updated nodes from each gap (Sonnet)
6. Interactive apply workflow — view the proposal and its evidence, then apply or skip

The goal: every pattern a senior engineer has to point out in code review eventually becomes a node that agents see before writing the code.

---

## filer measure

Quantify the impact of your knowledge layer using real PR data:

```bash
filer measure                             # All merged PRs
filer measure --since 2026-01-01          # Since a date
filer measure --before-after 2026-03-01   # Compare metrics before and after Filer adoption
filer measure --pr 147                    # Single PR
```

Metrics:
- **Constraint violation rate** — PRs that touch a `must_not` pattern from a constraint or security node
- **PR iteration count** — avg commits per PR before merge, by author
- **Review comment distribution** — classified as convention / constraint / logic / style

---

## Environment variables

```bash
ANTHROPIC_API_KEY   # Anthropic provider (default)
OPENAI_API_KEY      # OpenAI provider
GITHUB_TOKEN        # Required for filer learn and filer measure
```

---

## LLM providers

```bash
filer init --provider anthropic   # Claude Sonnet 4.6 + Haiku 4.5 (default)
filer init --provider openai      # GPT-4o + GPT-4o-mini
filer init --provider ollama      # Local Ollama (llama3.3)
```

---

## Quality bar

Zero nodes is better than low-quality nodes. Filer will not emit a node with confidence below 0.75, and will not emit more than 8 nodes per module. An agent that loads a Filer node trusts it — a wrong constraint is worse than no constraint.

---

## License

MIT
