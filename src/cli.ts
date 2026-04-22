#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
import { initCommand }   from './commands/init.js';
import { indexCommand }  from './commands/index.js';
import { updateCommand } from './commands/update.js';
import { statsCommand }  from './commands/stats.js';
import { showCommand }   from './commands/show.js';
import { queryCommand }  from './commands/query.js';
import { verifyCommand } from './commands/verify.js';
import { hookCommand }   from './commands/hook.js';
import { learnCommand }     from './commands/learn.js';
import { measureCommand }   from './commands/measure.js';
import { benchmarkCommand } from './commands/benchmark.js';
import { mcpCommand }       from './commands/mcp.js';
import { wizardCommand }    from './commands/wizard.js';
import { scanCommand }      from './commands/scan.js';
import { layerCommand }     from './commands/layer.js';
import { reviewCommand }    from './commands/review.js';
import { filerExists }      from './store/mod.js';

const program = new Command();

program
  .name('filer')
  .description('The knowledge layer for codebases — structured context for AI agents')
  .version(version);

program
  .command('init')
  .description('Initialize Filer in the current repository')
  .option('--provider <provider>', 'LLM provider: anthropic | openai | ollama', 'anthropic')
  .option('--model <model>', 'LLM model to use (defaults to provider recommendation)')
  .option('--no-hook', 'Skip git post-commit hook installation')
  .option('--force', 'Reinitialize even if .filer/ already exists')
  .action((options) => initCommand(options));

program
  .command('stats')
  .description('Show coverage and freshness summary')
  .action(() => statsCommand());

program
  .command('show [id]')
  .description('Display one or more knowledge nodes')
  .option('--type <types>', 'Filter by node type(s), comma-separated')
  .option('--scope <path>', 'Filter by scope path')
  .option('--verified', 'Show only verified nodes')
  .option('--json', 'Output raw JSON')
  .action((id, options) => showCommand(id, options));

program
  .command('scan')
  .description('Scan codebase and generate an HTML security report')
  .option('--output <path>', 'Output path for HTML report', '.filer/report.html')
  .option('--scope <path>', 'Limit to a specific directory')
  .option('--parallel <n>', 'Number of modules to process concurrently. Recommended: 3-5. Default: 1.', '1')
  .option('--no-open', 'Do not auto-open report in browser')
  .option('--force', 'Re-scan already-scanned files')
  .option('--ci', 'Exit non-zero if findings meet the fail threshold (for CI pipelines)')
  .option('--fail-on <severity>', 'Severity level that triggers CI failure: critical|high|medium (default: high)', 'high')
  .action((options) => scanCommand(options).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('layer')
  .description('Build the agent knowledge layer (commits .filer/ nodes for AI agents)')
  .option('--scope <path>', 'Limit to a specific directory')
  .option('--parallel <n>', 'Number of modules to process concurrently. Default: 1.', '1')
  .option('--force', 'Re-index already-indexed files')
  .option('--dry-run', 'Show what would be indexed without writing')
  .option('--cost', 'Estimate LLM cost without making API calls')
  .action((options) => layerCommand(options).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('index')
  .description('Build the full knowledge layer from your codebase')
  .option('--scope <path>', 'Limit indexing to a specific directory')
  .option('--type <types>', 'Limit to specific node types (comma-separated)')
  .option('--force', 'Re-index already-indexed files')
  .option('--dry-run', 'Show what would be indexed without writing')
  .option('--cost', 'Estimate LLM cost without making API calls')
  .option('--parallel <n>', 'Process N modules concurrently. Higher values are faster but may hit API rate limits. Recommended: 3-5. Default: 1.', '1')
  .option('--fast', 'Use indexing model (Haiku) for all modules — faster and cheaper')
  .action((options) => indexCommand(options).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('update')
  .description('Incremental update from last git commit')
  .option('--since <ref>', 'Git ref to diff from (default: HEAD~1)')
  .option('--silent', 'Suppress output (for git hook use)')
  .option('--check-stale', 'Run LLM staleness check on high-risk nodes after update')
  .action((options) => updateCommand(options).catch(err => {
    if (!options.silent) console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('query <question>')
  .description('Ask a natural language question about the codebase knowledge')
  .option('--type <types>', 'Filter nodes by type(s), comma-separated')
  .option('--scope <path>', 'Limit to a specific scope path')
  .option('--no-llm', 'Skip LLM synthesis, return keyword-matched nodes only')
  .option('--json', 'Output raw JSON')
  .action((question, options) => queryCommand(question, options).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('verify')
  .description('Interactive node verification workflow')
  .option('--type <types>', 'Verify only specific node types')
  .option('--stale', 'Verify only potentially stale nodes')
  .option('--unverified-only', 'Skip already verified nodes')
  .action((options) => verifyCommand(options).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('review')
  .description('Generate a machine-readable review bundle (pending.json) + HTML report for human or agent review')
  .option('--type <types>', 'Review only specific node types (comma-separated)')
  .option('--stale', 'Include only potentially stale nodes')
  .option('--unverified-only', 'Include only unverified nodes')
  .option('--apply', 'Apply decisions from an already-reviewed pending.json')
  .option('--no-open', 'Do not auto-open the HTML report in browser')
  .option('--output <path>', 'Output path for HTML report', '.filer/review/report.html')
  .action((options) => reviewCommand(options).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('hook <action>')
  .description('Manage git post-commit hook (install | uninstall | status)')
  .action((action) => hookCommand(action).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('learn')
  .description('Learn from PR review comments to propose new knowledge nodes')
  .option('--since <date>', 'Only fetch PRs merged after this date (YYYY-MM-DD)')
  .option('--pr <number>', 'Fetch a specific PR by number')
  .option('--auto-apply', 'Auto-apply nodes with confidence >= 0.85')
  .option('--dry-run', 'Show proposals without writing nodes')
  .action((options) => learnCommand(options).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('measure')
  .description('Compute productivity metrics from GitHub PR data')
  .option('--since <date>', 'Only analyse PRs merged after this date (YYYY-MM-DD)')
  .option('--before <date>', 'Only analyse PRs merged before this date (YYYY-MM-DD)')
  .option('--before-after <date>', 'Compare metrics before and after this pivot date')
  .option('--pr <number>', 'Analyse a single PR by number')
  .action((options) => measureCommand(options).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('benchmark')
  .description('Run identical tasks with/without Filer context and score outputs')
  .option('--task <n>', 'Task to benchmark: implement-feature | review-code | debug-issue')
  .option('--scope <path>', 'Scope to load knowledge nodes from (auto-detected if not set)')
  .option('--runs <n>', 'Number of runs per variant', '3')
  .option('--output <file>', 'Save full report as JSON to this path')
  .option('--dry-run', 'Show what would run without making API calls')
  .action((options) => benchmarkCommand(options).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

program
  .command('mcp')
  .description('Start the Filer MCP server (stdio transport) for Claude Code / Cursor')
  .action(() => mcpCommand().catch(err => {
    console.error('MCP server error:', err.message);
    process.exit(1);
  }));

program
  .action(async () => {
    const root = process.cwd();
    if (!filerExists(root)) {
      await wizardCommand();
    } else {
      await statsCommand();
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error('\n  Error:', err.message, '\n');
  process.exit(1);
});
