import chalk from 'chalk';
import { filerExists } from '../store/mod.js';
import { parseEvent, type AgentEventContext } from '../agent/events.js';
import { runOrchestrator } from '../agent/orchestrator.js';
import { runReActLoop }    from '../agent/loop.js';

export interface AgentOptions {
  event?:     string;
  pr?:        string;
  since?:     string;
  autoApply?: boolean;
  dryRun?:    boolean;
  failOn?:    string;
}

export async function agentCommand(options: AgentOptions): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    console.error(chalk.red('\n  Error: No .filer/ directory. Run: filer init && filer index\n'));
    process.exit(1);
  }

  // No --event → ReAct reasoning loop (Phase 2): LLM decides what to do
  if (!options.event) {
    const result = await runReActLoop(root, { dryRun: options.dryRun });
    if (!result.success) process.exit(1);
    return;
  }

  // --event → deterministic orchestrator (Phase 1)
  let event: ReturnType<typeof parseEvent>;
  try {
    event = parseEvent(options.event);
  } catch (err) {
    console.error(chalk.red(`\n  ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }

  const ctx: AgentEventContext = {
    event,
    prNumber:  options.pr  ? parseInt(options.pr, 10) : undefined,
    since:     options.since,
    autoApply: options.autoApply,
    dryRun:    options.dryRun,
    failOn:    options.failOn,
  };

  if (options.dryRun) {
    process.stderr.write(chalk.dim('\n  [dry-run] — no changes will be made\n\n'));
  } else {
    process.stderr.write(chalk.bold(`\n  filer agent — event: ${event}\n\n`));
  }

  const result = await runOrchestrator(root, ctx);

  if (options.dryRun) {
    printDryRun(event, ctx);
    return;
  }

  process.stderr.write('\n');
  if (result.success) {
    process.stderr.write(chalk.green(`  ✓ ${result.summary}\n\n`));
  } else {
    process.stderr.write(chalk.red(`  ✗ ${result.summary}\n\n`));
    process.exit(1);
  }
}

function printDryRun(event: string, ctx: AgentEventContext): void {
  const lines: string[] = [];

  switch (event) {
    case 'commit':
      lines.push(`Would run: filer update --since ${ctx.since ?? 'HEAD~1'}`);
      break;
    case 'pr_merged':
      lines.push(`Would run: filer learn${ctx.prNumber ? ` --pr ${ctx.prNumber}` : ''}${ctx.autoApply ? ' --auto-apply' : ''}`);
      break;
    case 'ci':
      lines.push(`Would run: filer scan --ci --fail-on ${ctx.failOn ?? 'high'}`);
      break;
    case 'scheduled':
      lines.push(`Would run: filer update --check-stale`);
      lines.push(`Would surface: unverified nodes in .filer/review/pending.json`);
      break;
  }

  for (const line of lines) {
    process.stdout.write(chalk.dim(`  → ${line}\n`));
  }
  process.stdout.write('\n');
}
