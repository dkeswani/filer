import chalk from 'chalk';
import fs    from 'fs';
import path  from 'path';
import { resolveOriginRepo } from '../schema/mod.js';

export interface SkillOptions {
  agent?: string;  // claude | cursor | codex | all (default: all)
  dry?:   boolean;
}

const FILER_MARKER = '<!-- filer:skill -->';

// ── Claude Code: writes into CLAUDE.md ───────────────────────────────────────

function claudeSkillBlock(repo: string): string {
  return `${FILER_MARKER}
## Filer Knowledge Layer

This repo uses **Filer** to maintain a structured knowledge graph of architectural decisions,
constraints, security rules, and code patterns. Before editing code, always consult the
knowledge layer via the MCP tools below.

**Repo:** ${repo}

### Filer MCP tools (always available via \`filer mcp\`)

| Tool | When to use |
|---|---|
| \`filer_scope\` | Load knowledge nodes for the files you are about to edit |
| \`filer_governing\` | Find all semantic rules governing a specific file or function |
| \`filer_affected\` | Before a PR — check which rules apply to changed files |
| \`filer_check\` | Validate a code snippet against constraints for a scope |
| \`filer_query\` | Search knowledge by keyword when scope is unclear |
| \`filer_graph_stats\` | See overall graph coverage |
| \`filer_explain\` | Deep-dive a node and its relationships |

### Workflow

1. When opening files to edit: call \`filer_scope\` with those file paths
2. Respect all \`security\` and \`constraint\` nodes — never override them silently
3. If you write code that may violate a constraint, call \`filer_check\` first
4. After editing, note which nodes governed the changed files in your commit message
<!-- /filer:skill -->
`;
}

// ── Cursor: writes .cursorrules ───────────────────────────────────────────────

function cursorSkillBlock(repo: string): string {
  return `${FILER_MARKER}
# Filer Knowledge Layer — ${repo}

Before editing any file, use the Filer MCP to load its governing knowledge nodes:
- filer_scope: load nodes for the files you are editing
- filer_governing: list semantic rules governing a specific file
- filer_affected: check which rules apply to a set of changed paths
- filer_check: validate a code snippet against constraints
- filer_query: keyword search across the knowledge graph

Always respect security and constraint nodes. Never silently bypass them.
<!-- /filer:skill -->
`;
}

// ── Codex: writes .codex/instructions.md ─────────────────────────────────────

function codexSkillBlock(repo: string): string {
  return `${FILER_MARKER}
# Filer Knowledge Layer — ${repo}

This repository has a Filer knowledge graph. Use the following tools before editing:
- filer_scope([file, ...])  → load governing rules for those files
- filer_governing(file)     → list all rules governing a file
- filer_check(code, scope)  → check code against constraints
- filer_query(question)     → search knowledge by keyword

Respect all security and constraint rules returned by these tools.
<!-- /filer:skill -->
`;
}

// ── Install helpers ───────────────────────────────────────────────────────────

function upsertBlock(filePath: string, block: string, label: string, dry: boolean): void {
  const exists   = fs.existsSync(filePath);
  const existing = exists ? fs.readFileSync(filePath, 'utf8') : '';

  if (existing.includes(FILER_MARKER)) {
    // Replace existing block
    const replaced = existing.replace(
      /<!-- filer:skill -->[\s\S]*?<!-- \/filer:skill -->\n?/,
      block
    );
    if (!dry) fs.writeFileSync(filePath, replaced);
    console.log(chalk.green(`  ✓ Updated Filer skill block in ${label}`));
  } else {
    const content = existing ? existing + '\n' + block : block;
    if (!dry) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
    console.log(chalk.green(`  ✓ Installed Filer skill in ${label}`));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function skillCommand(options: SkillOptions): Promise<void> {
  const root   = process.cwd();
  const repo   = resolveOriginRepo(root);
  const agents = options.agent ? [options.agent] : ['claude', 'cursor', 'codex'];
  const dry    = options.dry ?? false;

  if (dry) console.log(chalk.dim('\n  Dry run — no files written.\n'));
  else console.log();

  if (agents.includes('claude') || agents.includes('all')) {
    const target = path.join(root, 'CLAUDE.md');
    upsertBlock(target, claudeSkillBlock(repo), 'CLAUDE.md', dry);
  }

  if (agents.includes('cursor') || agents.includes('all')) {
    const target = path.join(root, '.cursorrules');
    upsertBlock(target, cursorSkillBlock(repo), '.cursorrules', dry);
  }

  if (agents.includes('codex') || agents.includes('all')) {
    const target = path.join(root, '.codex', 'instructions.md');
    upsertBlock(target, codexSkillBlock(repo), '.codex/instructions.md', dry);
  }

  console.log();
  console.log(chalk.dim('  Make sure `filer mcp` is registered in your agent\'s MCP config.'));
  console.log();
}
