import path from 'path';
import fs   from 'fs';
import { exec } from 'child_process';
import chalk from 'chalk';
import ora   from 'ora';
import { filerExists, readConfig, readAllNodes } from '../store/mod.js';
import { runIndex }   from '../pipeline/indexer.js';
import { generateReport } from '../report/generator.js';

type FailOnSeverity = 'critical' | 'high' | 'medium';

interface ScanOptions {
  output?:    string;
  scope?:     string;
  parallel?:  string;
  open?:      boolean;
  force?:     boolean;
  ci?:        boolean;
  failOn?:    FailOnSeverity;
}

export async function scanCommand(options: ScanOptions): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
    process.exit(1);
  }

  const config = readConfig(root);
  if (!config) {
    console.error(chalk.red('\n  No .filer-config.json found. Run: filer init\n'));
    process.exit(1);
  }

  const outputPath = options.output ?? path.join('.filer', 'report.html');
  const concurrency = options.parallel ? parseInt(options.parallel, 10) : 1;

  console.log(chalk.bold('\n  Filer Scan\n'));
  if (concurrency > 1) {
    console.log(chalk.dim(`  Concurrency: ${concurrency} modules in parallel`));
  }

  // Run extraction
  const result = await runIndex({
    root,
    scope:       options.scope,
    force:       options.force,
    concurrency,
    silent:      false,
  });

  // Read all nodes from disk (includes pre-existing)
  const nodes = readAllNodes(root);

  // Generate report
  const spinner = ora('  Generating HTML report...').start();

  const repoName = path.basename(root);
  const report   = generateReport({
    nodes,
    repoName,
    scannedAt:    new Date().toISOString(),
    filesIndexed: result.files_indexed,
    estimatedUsd: result.estimated_usd,
    model:        config.llm.model,
    rejected:     result.nodes_rejected,
  });

  const absOutput = path.resolve(root, outputPath);
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });
  fs.writeFileSync(absOutput, report, 'utf-8');

  spinner.succeed(`  Report written to ${outputPath}`);

  // Auto-open browser
  const shouldOpen = options.open !== false;
  if (shouldOpen) {
    openBrowser(absOutput);
    console.log(chalk.dim('  Opened in browser ✓'));
  }

  // Terminal summary
  const counts = {
    CRITICAL: nodes.filter(n => ['security'].includes(n.type)).length,
    HIGH:     nodes.filter(n => ['danger'].includes(n.type)).length,
    MEDIUM:   nodes.filter(n => ['constraint','assumption','antipattern'].includes(n.type)).length,
    INFO:     nodes.filter(n => ['pattern','intent','decision'].includes(n.type)).length,
  };

  console.log(chalk.bold('\n  Filer Scan Complete\n'));
  console.log(`  Report: ${chalk.cyan(outputPath)}`);
  console.log();
  console.log(`  ┌${'─'.repeat(43)}┐`);
  console.log(`  │  ${chalk.bold(String(nodes.length).padEnd(6))} findings  ·  ${repoName.padEnd(20)} │`);
  console.log(`  │                                           │`);
  console.log(`  │  ${chalk.red('●')} ${String(counts.CRITICAL).padEnd(4)} CRITICAL   security             │`);
  console.log(`  │  ${chalk.hex('#ea580c')('●')} ${String(counts.HIGH).padEnd(4)} HIGH       danger               │`);
  console.log(`  │  ${chalk.yellow('●')} ${String(counts.MEDIUM).padEnd(4)} MEDIUM     constraint/assumption │`);
  console.log(`  │  ${chalk.blue('●')} ${String(counts.INFO).padEnd(4)} INFO       pattern/intent       │`);
  console.log(`  └${'─'.repeat(43)}┘`);
  console.log();
  console.log(`  Share: ${chalk.dim(outputPath)}`);
  console.log(`  Next:  ${chalk.cyan('filer layer')}  (commit knowledge nodes for agents)\n`);

  // CI mode: exit non-zero if findings meet or exceed the fail threshold
  if (options.ci) {
    const failOn: FailOnSeverity = options.failOn ?? 'high';
    const failCount = ciFailCount(counts, failOn);
    if (failCount > 0) {
      console.error(chalk.red(`  CI: ${failCount} finding(s) at or above ${failOn.toUpperCase()} severity. Exiting 1.\n`));
      process.exit(1);
    }
    console.log(chalk.green(`  CI: No findings at or above ${failOn.toUpperCase()} severity. ✓\n`));
  }
}

function ciFailCount(
  counts: { CRITICAL: number; HIGH: number; MEDIUM: number; INFO: number },
  failOn: FailOnSeverity
): number {
  switch (failOn) {
    case 'critical': return counts.CRITICAL;
    case 'high':     return counts.CRITICAL + counts.HIGH;
    case 'medium':   return counts.CRITICAL + counts.HIGH + counts.MEDIUM;
  }
}

function openBrowser(filePath: string): void {
  const url = `file://${filePath.replace(/\\/g, '/')}`;
  if (process.platform === 'win32') exec(`start "" "${url}"`);
  else if (process.platform === 'darwin') exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`);
}
