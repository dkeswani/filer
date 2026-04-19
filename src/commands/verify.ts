import chalk from 'chalk';
import * as readline from 'readline';
import {
  readAllNodes,
  writeNode,
  filerExists,
} from '../store/mod.js';
import { AnyNode, NodeType, NODE_PRIORITY } from '../schema/mod.js';

interface VerifyOptions {
  type?:           string;
  stale?:          boolean;
  unverifiedOnly?: boolean;
}

export async function verifyCommand(options: VerifyOptions): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
    process.exit(1);
  }

  let nodes = readAllNodes(root);

  if (options.type) {
    const types = options.type.split(',').map(t => t.trim()) as NodeType[];
    nodes = nodes.filter(n => types.includes(n.type));
  }

  if (options.stale) {
    nodes = nodes.filter(n => n.stale_risk >= 0.5);
  }

  if (options.unverifiedOnly) {
    nodes = nodes.filter(n => !n.verified);
  }

  if (nodes.length === 0) {
    console.log(chalk.green('\n  No nodes to verify with the given filters.\n'));
    return;
  }

  nodes.sort((a, b) => (NODE_PRIORITY[a.type] ?? 9) - (NODE_PRIORITY[b.type] ?? 9));

  console.log(chalk.bold(`\n  Filer Verify — ${nodes.length} node(s) to review\n`));
  console.log(chalk.dim('  Keys: [y] verify  [n] reject  [e] edit  [s] skip  [q] quit\n'));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  let verified = 0;
  let rejected = 0;
  let skipped  = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    printNodeSummary(node, i + 1, nodes.length);

    const answer = await ask(chalk.bold('  Action: '));
    const key = answer.trim().toLowerCase();

    if (key === 'q') {
      console.log(chalk.dim('\n  Quit.\n'));
      break;
    } else if (key === 'y') {
      writeNode(root, { ...node, verified: true, stale_risk: 0 });
      console.log(chalk.green('  ✓ Verified\n'));
      verified++;
    } else if (key === 'n') {
      writeNode(root, { ...node, verified: false, stale_risk: 1.0 });
      console.log(chalk.red('  ✗ Rejected (marked stale)\n'));
      rejected++;
    } else if (key === 's') {
      console.log(chalk.dim('  Skipped\n'));
      skipped++;
    } else if (key === 'e') {
      console.log(chalk.dim(`\n  Edit: .filer/${node.type}/${node.id.split(':')[1]}.json\n`));
      skipped++;
    } else {
      console.log(chalk.dim('  Skipped\n'));
      skipped++;
    }
  }

  rl.close();

  console.log(chalk.bold('\n  Summary:'));
  console.log(`  ${chalk.green(String(verified))} verified  ${chalk.red(String(rejected))} rejected  ${chalk.dim(String(skipped))} skipped\n`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function printNodeSummary(node: AnyNode, idx: number, total: number): void {
  const typeColor = getTypeColor(node.type);
  const staleBadge = node.stale_risk >= 0.5 ? chalk.yellow(' ⚠ stale') : '';
  const verifiedBadge = node.verified ? chalk.green(' ✓') : chalk.dim(' (unverified)');

  console.log(`  [${idx}/${total}] ` + typeColor(`[${node.type.toUpperCase()}] `) + chalk.bold(node.id) + verifiedBadge + staleBadge);
  console.log(chalk.dim('  scope: ') + node.scope.join(', '));
  console.log(chalk.dim('  confidence: ') + `${Math.round(node.confidence * 100)}%  stale_risk: ${Math.round(node.stale_risk * 100)}%`);
  console.log();

  const summary = getNodeSummary(node);
  console.log('  ' + summary);
  console.log();
}

function getNodeSummary(node: AnyNode): string {
  switch (node.type) {
    case 'constraint':  return `${chalk.bold('Statement:')} ${node.statement}\n  ${chalk.red('If violated:')} ${node.if_violated}`;
    case 'danger':      return `${chalk.bold('Statement:')} ${node.statement}\n  ${chalk.dim('Condition:')} ${node.condition}`;
    case 'assumption':  return `${chalk.bold('Statement:')} ${node.statement}\n  ${chalk.red('Breaks when:')} ${node.breaks_when}`;
    case 'pattern':     return `${chalk.bold('Statement:')} ${node.statement}\n  ${chalk.dim('Why:')} ${node.why}`;
    case 'intent':      return `${chalk.bold('Purpose:')} ${node.purpose}`;
    case 'decision':    return `${chalk.bold('Statement:')} ${node.statement}\n  ${chalk.dim('Reason:')} ${node.reason}`;
    case 'security':    return `${chalk.bold('Statement:')} ${node.statement}\n  ${chalk.red('If violated:')} ${node.if_violated}`;
    case 'antipattern': return `${chalk.bold('Statement:')} ${node.statement}\n  ${chalk.green('Correct:')} ${node.correct_pattern}`;
  }
}

function getTypeColor(type: string): (s: string) => string {
  const colors: Record<string, (s: string) => string> = {
    security:    chalk.red,
    constraint:  chalk.yellow,
    danger:      chalk.magenta,
    assumption:  chalk.blue,
    antipattern: chalk.cyan,
    pattern:     chalk.green,
    intent:      chalk.white,
    decision:    chalk.gray,
  };
  return colors[type] ?? chalk.white;
}
