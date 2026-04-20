# Filer Knowledge Layer

This repository uses [Filer](https://github.com/dkeswani/filer) to maintain a structured
knowledge layer for AI agents. The `.filer/` directory contains extracted knowledge about
this codebase — constraints, patterns, dangers, security rules, and decisions.

## For AI Agents

Before writing any code in this repository:

1. Read `.filer/index.json` to orient yourself — it lists all knowledge nodes with scope and summary
2. For files you will touch, filter nodes where `scope` matches your working paths
3. Load **ALL** `security` nodes in scope — these are absolute rules, never violate them
4. Load **ALL** `constraint` nodes in scope — these are hard architectural boundaries
5. Load `danger` nodes — these are known failure modes in this codebase
6. Load `assumption` nodes for modules you will call or import from
7. Load `pattern` nodes to understand the local coding dialect
8. Load `antipattern` nodes — these are approaches that look right but are wrong here

## Node Priority

| Priority | Type | Description |
|----------|------|-------------|
| CRITICAL | `security` | Never violate — regulatory, auth, data exposure rules |
| CRITICAL | `constraint` | Hard architectural boundaries enforced by convention |
| HIGH | `danger` | Known non-obvious failure modes |
| HIGH | `assumption` | Implicit dependencies that are not in the type system |
| HIGH | `antipattern` | Approaches that look correct but are wrong here |
| MEDIUM | `pattern` | The local dialect — how this codebase does things |
| MEDIUM | `intent` | What modules own and explicitly do not own |
| LOWER | `decision` | Why non-obvious choices were made |

## Rules for Agents

- **Never violate a `security` node** without stopping and explaining to the developer
- **Never violate a `constraint` node** without explicit justification
- **Always follow `pattern` nodes** — deviations require a stated reason
- If a node seems wrong or outdated, note it but do not ignore it
- Unverified nodes (`verified: false`) are LLM hypotheses — treat with appropriate skepticism

## Updating Filer

```bash
filer update    # incremental update from last commit
filer verify    # human verification workflow
filer stats     # coverage and freshness report
```
