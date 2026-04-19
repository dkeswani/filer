#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand }   from './commands/init.js';
import { indexCommand }  from './commands/index.js';
import { updateCommand } from './commands/update.js';
import { statsCommand }  from './commands/stats.js';
import { showCommand }   from './commands/show.js';
import { queryCommand }  from './commands/query.js';
import { verifyCommand } from './commands/verify.js';
import { hookCommand }   from './commands/hook.js';
import { learnCommand }  from './commands/learn.js';
import { mcpCommand }    from './commands/mcp.js';

const program = new Command();

program
  .name('filer')
  .description('The knowledge layer for codebases — structured context for AI agents')
  .version('0.1.0');

// ── filer init ────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Initialize Filer in the current repository')
  .option('--provider <provider>', 'LLM provider: anthropic | openai | ollama', 'anthropic')
  .option('--model <model>', 'LLM model to use (defaults to provider recommendation)')
  .option('--no-hook', 'Skip git post-commit hook installation')
  .option('--force', 'Reinitialize even if .filer/ already exists')
  .action((options) => initCommand(options));

// ── filer stats ───────────────────────────────────────────────────────────────
program
  .command('stats')
  .description('Show coverage and freshness summary')
  .action(() => statsCommand());

// ── filer show ────────────────────────────────────────────────────────────────
program
  .command('show [id]')
  .description('Display one or more knowledge nodes')
  .option('--type <types>', 'Filter by node type(s), comma-separated')
  .option('--scope <path>', 'Filter by scope path')
  .option('--verified', 'Show only verified nodes')
  .option('--json', 'Output raw JSON')
  .action((id, options) => showCommand(id, options));

// ── filer index ───────────────────────────────────────────────────────────────
program
  .command('index')
  .description('Build the full knowledge layer from your codebase')
  .option('--scope <path>', 'Limit indexing to a specific directory')
  .option('--type <types>', 'Limit to specific node types (comma-separated)')
  .option('--force', 'Re-index already-indexed files')
  .option('--dry-run', 'Show what would be indexed without writing')
  .option('--cost', 'Estimate LLM cost without making API calls')
  .action((options) => indexCommand(options).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

// ── filer update ──────────────────────────────────────────────────────────────
program
  .command('update')
  .description('Incremental update from last git commit')
  .option('--since <ref>', 'Git ref to diff from (default: HEAD~1)')
  .option('--silent', 'Suppress output (for git hook use)')
  .action((options) => updateCommand(options).catch(err => {
    if (!options.silent) console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

// ── filer query ───────────────────────────────────────────────────────────────
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

// ── filer verify ──────────────────────────────────────────────────────────────
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

// ── filer hook ────────────────────────────────────────────────────────────────
program
  .command('hook <action>')
  .description('Manage git post-commit hook (install | uninstall | status)')
  .action((action) => hookCommand(action).catch(err => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }));

// ── filer learn ───────────────────────────────────────────────────────────────
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

// ── filer mcp ─────────────────────────────────────────────────────────────────
program
  .command('mcp')
  .description('Start the Filer MCP server (stdio transport) for Claude Code / Cursor')
  .action(() => mcpCommand().catch(err => {
    console.error('MCP server error:', err.message);
    process.exit(1);
  }));

program.parseAsync(process.argv).catch((err) => {
  console.error('\n  Error:', err.message, '\n');
  process.exit(1);
});
