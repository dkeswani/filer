import chalk from 'chalk';
import {
  readIndex,
  readAllNodes,
  filerExists,
} from '../store/mod.js';
import { NODE_TYPES, NodeType } from '../schema/mod.js';

export async function statsCommand(): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    console.error(chalk.red('\n  No .filer/ directory found.'));
    console.error(chalk.dim('  Run: filer init\n'));
    process.exit(1);
  }

  const index = readIndex(root);
  if (!index || index.stats.nodes_total === 0) {
    console.log(chalk.yellow('\n  No nodes indexed yet.'));
    console.log(chalk.dim('  Run: filer index\n'));
    return;
  }

  const nodes = readAllNodes(root);
  const staleNodes = nodes.filter(n => n.stale_risk >= 0.5);
  const unverifiedSecurity = nodes.filter(n => n.type === 'security' && !n.verified);

  console.log(chalk.bold('\n  Filer Knowledge Layer — Stats\n'));
  console.log('  ' + chalk.dim('Repository:   ') + index.repo);
  console.log('  ' + chalk.dim('Last indexed: ') + formatAge(index.indexed_at));
  if (index.last_commit) {
    console.log('  ' + chalk.dim('Last commit:  ') + chalk.cyan(index.last_commit));
  }
  console.log('  ' + chalk.dim('LLM:          ') + index.llm);

  console.log('\n  ' + chalk.bold('Coverage'));
  console.log('  ' + chalk.dim('Files indexed: ') + index.stats.files_indexed);

  const bar = progressBar(index.stats.coverage_pct, 30);
  console.log('  ' + chalk.dim('Coverage:      ') + bar + ' ' + chalk.bold(`${index.stats.coverage_pct}%`));

  console.log('\n  ' + chalk.bold('Knowledge Nodes') + chalk.dim(` (${index.stats.nodes_total} total)`));

  // Per-type breakdown with colors
  const typeColors: Record<NodeType, (s: string) => string> = {
    security:    chalk.red,
    constraint:  chalk.yellow,
    danger:      chalk.magenta,
    assumption:  chalk.blue,
    antipattern: chalk.cyan,
    pattern:     chalk.green,
    intent:      chalk.white,
    decision:    chalk.gray,
  };

  for (const type of NODE_TYPES) {
    const count = index.stats.by_type[type] ?? 0;
    if (count === 0) continue;

    const typeNodes  = nodes.filter(n => n.type === type);
    const verified   = typeNodes.filter(n => n.verified).length;
    const verifiedPct = count > 0 ? Math.round((verified / count) * 100) : 0;
    const colorFn   = typeColors[type];

    const verifiedStr = chalk.dim(`  ${verified}/${count} verified (${verifiedPct}%)`);
    console.log('  ' + colorFn(`  ${type.padEnd(12)}`) + chalk.bold(`${String(count).padStart(4)}`) + verifiedStr);
  }

  // Overall verified pct
  const overallVerified = nodes.filter(n => n.verified).length;
  const overallVerifiedPct = nodes.length > 0 ? Math.round((overallVerified / nodes.length) * 100) : 0;
  console.log('\n  ' + chalk.dim('Verified overall: ') + chalk.bold(`${overallVerifiedPct}%`));

  // Alerts
  if (staleNodes.length > 0) {
    console.log('\n  ' + chalk.yellow(`⚠  ${staleNodes.length} node(s) may be stale (stale_risk ≥ 0.5)`));
    console.log('  ' + chalk.dim('   Run: filer verify --stale'));
  }

  if (unverifiedSecurity.length > 0) {
    console.log('\n  ' + chalk.red(`🔒 ${unverifiedSecurity.length} security node(s) are unverified`));
    console.log('  ' + chalk.dim('   Run: filer verify --type security'));
  }

  if (staleNodes.length === 0 && unverifiedSecurity.length === 0) {
    console.log('\n  ' + chalk.green('✓  All clear — no stale or unverified security nodes'));
  }

  console.log();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAge(isoDate: string): string {
  const ms    = Date.now() - new Date(isoDate).getTime();
  const mins  = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);

  if (days > 0)  return chalk.dim(`${days}d ago`);
  if (hours > 0) return chalk.dim(`${hours}h ago`);
  if (mins > 0)  return chalk.dim(`${mins}m ago`);
  return chalk.green('just now');
}

function progressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const empty  = width - filled;
  const bar    = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  return `[${bar}]`;
}
