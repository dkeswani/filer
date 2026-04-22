import path from 'path';
import fs   from 'fs';
import { exec } from 'child_process';
import chalk from 'chalk';
import {
  generateBundle,
  writeBundle,
  readBundle,
  applyDecisions,
  PENDING_FILE,
} from '../review/bundle.js';
import { generateReviewHtml } from '../review/html.js';
import { filerExists } from '../store/mod.js';

interface ReviewOptions {
  type?:           string;
  unverifiedOnly?: boolean;
  stale?:          boolean;
  apply?:          boolean;
  html?:           boolean;
  open?:           boolean;
  output?:         string;
}

export async function reviewCommand(options: ReviewOptions): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
    process.exit(1);
  }

  // ── Apply mode: read back a reviewed pending.json and commit decisions ────

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

  // ── Generate mode: build bundle and write pending.json ────────────────────

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

  const pending  = bundle.review_items.filter(i => i.status === 'pending').length;
  const security = bundle.review_items.filter(i => i.type === 'security').length;
  if (security > 0) {
    console.log(chalk.yellow(`  ⚠  ${security} security node(s) require human verification`));
  }

  // ── HTML report (always generated) ───────────────────────────────────────

  const outputPath = options.output ?? path.join('.filer', 'review', 'report.html');
  const html = generateReviewHtml(bundle);
  const absOutput = path.resolve(root, outputPath);
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });
  fs.writeFileSync(absOutput, html, 'utf-8');
  console.log(`  Report:  ${chalk.cyan(outputPath)}`);

  if (options.open !== false) {
    openBrowser(absOutput);
    console.log(chalk.dim('  Opened in browser ✓'));
  }

  console.log();
  console.log(`  ${pending} item(s) awaiting decision.`);
  console.log();
  console.log(chalk.dim('  Agents: load .filer/review/pending.json, set status on each item, then run:'));
  console.log(`  ${chalk.cyan('filer review --apply')}  to commit decisions\n`);
}

function openBrowser(filePath: string): void {
  const url = `file://${filePath.replace(/\\/g, '/')}`;
  if (process.platform === 'win32') exec(`start "" "${url}"`);
  else if (process.platform === 'darwin') exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`);
}
