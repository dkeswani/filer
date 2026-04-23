import path      from 'path';
import fs        from 'fs';
import * as readline from 'readline';
import { exec }  from 'child_process';
import chalk     from 'chalk';
import {
  generateBundle,
  writeBundle,
  readBundle,
  applyDecisions,
  PENDING_FILE,
} from '../review/bundle.js';
import { generateReviewHtml } from '../review/html.js';
import { writeNode }          from '../store/mod.js';
import { ensureFilerExists, loadNodes } from './utils.js';

export interface ReviewOptions {
  type?:           string;
  unverifiedOnly?: boolean;
  stale?:          boolean;
  apply?:          boolean;
  tty?:            boolean;   // interactive CLI mode (was: filer verify)
  open?:           boolean;
  output?:         string;
}

export async function reviewCommand(options: ReviewOptions): Promise<void> {
  const root = process.cwd();
  ensureFilerExists(root);

  // ── --tty: interactive CLI verification (absorbed from filer verify) ───────
  if (options.tty) {
    await runTtyReview(root, options);
    return;
  }

  // ── --apply: commit decisions from a reviewed pending.json ────────────────
  if (options.apply) {
    const bundle = readBundle(root);
    if (!bundle) {
      console.error(chalk.red(`\n  No pending.json found at ${PENDING_FILE}. Run: filer review\n`));
      process.exit(1);
    }

    const decisions = bundle.review_items.map(item => ({
      id:             item.id,
      status:         item.status,
      review_comment: item.review_comment ?? undefined,
    }));

    const result = applyDecisions(root, decisions);
    console.log(chalk.bold('\n  Filer Review — Applied\n'));
    console.log(`  ${chalk.green(String(result.applied))} approved   ${chalk.red(String(result.rejected))} rejected   ${chalk.dim(String(result.skipped))} skipped\n`);
    return;
  }

  // ── Default: build bundle, write pending.json, open HTML report ───────────
  const bundle = generateBundle(root, {
    type:           options.type,
    unverifiedOnly: options.unverifiedOnly,
    stale:          options.stale,
  });

  if (bundle.review_items.length === 0) {
    console.log(chalk.green('\n  No nodes to review with the given filters.\n'));
    return;
  }

  const pendingPath = writeBundle(root, bundle);
  console.log(chalk.bold('\n  Filer Review\n'));
  console.log(`  ${chalk.cyan(bundle.review_items.length)} item(s) pending review`);
  console.log(`  Bundle: ${chalk.dim(pendingPath)}\n`);

  const security = bundle.review_items.filter(i => i.type === 'security').length;
  if (security > 0) {
    console.log(chalk.yellow(`  ⚠  ${security} security node(s) require human verification`));
  }

  const outputPath = options.output ?? path.join('.filer', 'review', 'report.html');
  const html       = generateReviewHtml(bundle);
  const absOutput  = path.resolve(root, outputPath);
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });
  fs.writeFileSync(absOutput, html, 'utf-8');
  console.log(`  Report:  ${chalk.cyan(outputPath)}`);

  if (options.open !== false) {
    openBrowser(absOutput);
    console.log(chalk.dim('  Opened in browser ✓'));
  }

  const pending = bundle.review_items.filter(i => i.status === 'pending').length;
  console.log();
  console.log(`  ${pending} item(s) awaiting decision.`);
  console.log();
  console.log(chalk.dim('  Agents: load .filer/review/pending.json, set status on each item, then run:'));
  console.log(`  ${chalk.cyan('filer review --apply')}  to commit decisions\n`);
  console.log(chalk.dim(`  Or run interactively: ${chalk.cyan('filer review --tty')}\n`));
}

// ── Interactive TTY review (was: filer verify) ────────────────────────────────

async function runTtyReview(root: string, options: ReviewOptions): Promise<void> {
  const nodes = loadNodes(root, {
    type:           options.type,
    stale:          options.stale,
    unverifiedOnly: options.unverifiedOnly ?? true,  // default to unverified in tty mode
  });

  if (nodes.length === 0) {
    console.log(chalk.green('\n  No nodes to review with the given filters.\n'));
    return;
  }

  console.log(chalk.bold(`\n  Filer Review (interactive) — ${nodes.length} node(s)\n`));
  console.log(chalk.dim('  Keys: [y] verify  [n] reject  [e] edit  [s] skip  [q] quit\n'));

  const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  let verified = 0, rejected = 0, skipped = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const typeColor  = getTypeColor(node.type);
    const staleBadge = node.stale_risk >= 0.5 ? chalk.yellow(' ⚠ stale') : '';
    const confPct    = Math.round(node.confidence * 100);

    console.log(`  [${i + 1}/${nodes.length}] ` + typeColor(`[${node.type.toUpperCase()}] `) + chalk.bold(node.id) + staleBadge);
    console.log(chalk.dim('  scope: ') + node.scope.join(', '));
    console.log(chalk.dim(`  confidence: ${confPct}%  stale_risk: ${Math.round(node.stale_risk * 100)}%\n`));
    console.log('  ' + getNodeSummary(node));
    console.log();

    const key = (await ask(chalk.bold('  Action: '))).trim().toLowerCase();

    if (key === 'q') { console.log(chalk.dim('\n  Quit.\n')); break; }
    else if (key === 'y') { writeNode(root, { ...node, verified: true,  stale_risk: 0   }); console.log(chalk.green('  ✓ Verified\n'));              verified++; }
    else if (key === 'n') { writeNode(root, { ...node, verified: false, stale_risk: 1.0 }); console.log(chalk.red('  ✗ Rejected (marked stale)\n')); rejected++; }
    else if (key === 'e') { console.log(chalk.dim(`\n  Edit: .filer/${node.type}/${node.id.split(':')[1]}.json\n`)); skipped++; }
    else                  { console.log(chalk.dim('  Skipped\n')); skipped++; }
  }

  rl.close();
  console.log(chalk.bold('\n  Summary:'));
  console.log(`  ${chalk.green(String(verified))} verified  ${chalk.red(String(rejected))} rejected  ${chalk.dim(String(skipped))} skipped\n`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNodeSummary(node: Parameters<typeof writeNode>[1]): string {
  switch ((node as any).type) {
    case 'constraint':  return `${chalk.bold('Statement:')} ${(node as any).statement}\n  ${chalk.red('If violated:')} ${(node as any).if_violated}`;
    case 'danger':      return `${chalk.bold('Statement:')} ${(node as any).statement}\n  ${chalk.dim('Condition:')} ${(node as any).condition}`;
    case 'assumption':  return `${chalk.bold('Statement:')} ${(node as any).statement}\n  ${chalk.red('Breaks when:')} ${(node as any).breaks_when}`;
    case 'pattern':     return `${chalk.bold('Statement:')} ${(node as any).statement}\n  ${chalk.dim('Why:')} ${(node as any).why}`;
    case 'intent':      return `${chalk.bold('Purpose:')} ${(node as any).purpose}`;
    case 'decision':    return `${chalk.bold('Statement:')} ${(node as any).statement}\n  ${chalk.dim('Reason:')} ${(node as any).reason}`;
    case 'security':    return `${chalk.bold('Statement:')} ${(node as any).statement}\n  ${chalk.red('If violated:')} ${(node as any).if_violated}`;
    case 'antipattern': return `${chalk.bold('Statement:')} ${(node as any).statement}\n  ${chalk.green('Correct:')} ${(node as any).correct_pattern}`;
    default:            return JSON.stringify(node).slice(0, 120);
  }
}

function getTypeColor(type: string): (s: string) => string {
  const c: Record<string, (s: string) => string> = {
    security: chalk.red, constraint: chalk.yellow, danger: chalk.magenta,
    assumption: chalk.blue, antipattern: chalk.cyan, pattern: chalk.green,
    intent: chalk.white, decision: chalk.gray,
  };
  return c[type] ?? chalk.white;
}

function openBrowser(filePath: string): void {
  const url = `file://${filePath.replace(/\\/g, '/')}`;
  if (process.platform === 'win32') exec(`start "" "${url}"`);
  else if (process.platform === 'darwin') exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`);
}
