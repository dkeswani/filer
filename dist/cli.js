#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { indexCommand } from './commands/index.js';
import { updateCommand } from './commands/update.js';
import { statsCommand } from './commands/stats.js';
import { showCommand } from './commands/show.js';
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
    if (!options.silent)
        console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
}));
program
    .command('query <question>')
    .description('Ask a natural language question about the codebase (Day 12–13)')
    .action(() => {
    console.log('\n  filer query — coming in Days 12–13 of the build\n');
    process.exit(0);
});
program
    .command('verify')
    .description('Interactive node verification workflow (Day 12–13)')
    .option('--type <types>', 'Verify only specific node types')
    .option('--stale', 'Verify only potentially stale nodes')
    .option('--unverified-only', 'Skip already verified nodes')
    .action(() => {
    console.log('\n  filer verify — coming in Days 12–13 of the build\n');
    process.exit(0);
});
program
    .command('hook <action>')
    .description('Manage git post-commit hook (install | uninstall | status)')
    .action(() => {
    console.log('\n  filer hook — coming in Days 10–11 of the build\n');
    process.exit(0);
});
program.parseAsync(process.argv).catch((err) => {
    console.error('\n  Error:', err.message, '\n');
    process.exit(1);
});
//# sourceMappingURL=cli.js.map