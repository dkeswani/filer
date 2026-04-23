#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

import { initCommand }       from './commands/init.js';
import { layerCommand }      from './commands/layer.js';
import { indexCommand }      from './commands/index.js';    // alias
import { updateCommand }     from './commands/update.js';   // alias
import { statsCommand }      from './commands/stats.js';
import { showCommand }       from './commands/show.js';
import { queryCommand }      from './commands/query.js';
import { verifyCommand }     from './commands/verify.js';   // alias
import { hookCommand }       from './commands/hook.js';
import { learnCommand }      from './commands/learn.js';
import { measureCommand }    from './commands/measure.js';
import { benchmarkCommand }  from './commands/benchmark.js';
import { mcpCommand }        from './commands/mcp.js';
import { wizardCommand }     from './commands/wizard.js';
import { scanCommand }       from './commands/scan.js';
import { secretsCommand }    from './commands/secrets.js';
import { reviewCommand }     from './commands/review.js';
import { exportCommand }     from './commands/export.js';
import { packCommand }       from './commands/pack.js';
import { agentCommand }      from './commands/agent.js';
import { filerExists }       from './store/mod.js';

const err = (e: Error) => { console.error(chalk.red(`\n  Error: ${e.message}\n`)); process.exit(1); };

const program = new Command();

program
  .name('filer')
  .description('Knowledge layer · Context packer · Security scanner · Autonomous agent')
  .version(version);

// ── Bootstrap ─────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize Filer in the current repository')
  .option('--provider <provider>', 'LLM provider: anthropic | openai | kimi | ollama', 'anthropic')
  .option('--model <model>',       'LLM model (defaults to provider recommendation)')
  .option('--no-hook',             'Skip git post-commit hook installation')
  .option('--force',               'Reinitialize even if .filer/ already exists')
  .action((options) => initCommand(options));

program
  .command('stats')
  .description('Coverage and freshness dashboard')
  .action(() => statsCommand());

// ── Knowledge layer (primary: filer layer) ────────────────────────────────────

program
  .command('layer')
  .description('Build or update the knowledge layer — the core Filer command')
  .option('--update',              'Incremental re-index from last commit (replaces: filer update)')
  .option('--since <ref>',         'Git ref to diff from when using --update (default: HEAD~1)')
  .option('--check-stale',         'LLM staleness check on high-risk nodes (use with --update)')
  .option('--silent',              'Suppress output — for git hook use (use with --update)')
  .option('--scope <path>',        'Limit to a specific directory')
  .option('--parallel <n>',        'Process N modules concurrently (recommended: 3–5, default: 1)')
  .option('--fast',                'Use indexing model for all tasks — faster and cheaper')
  .option('--force',               'Re-index already-indexed files')
  .option('--dry-run',             'Show what would be indexed without writing')
  .option('--cost',                'Estimate API cost without making any calls')
  .option('--detect-conflicts',    'Check new nodes for semantic contradictions with existing ones')
  .action((options) => layerCommand(options).catch(err));

// ── Security ──────────────────────────────────────────────────────────────────

program
  .command('secrets')
  .description('Scan for hardcoded secrets and credentials (no LLM — fast static analysis)')
  .option('--scope <path>',  'Limit to a specific directory')
  .option('--json',          'Output findings as JSON')
  .option('--ci',            'Exit non-zero if any secrets are found')
  .action((options) => secretsCommand(options).catch(err));

program
  .command('scan')
  .description('Security scan → .filer/report.html')
  .option('--output <path>',       'Output path for HTML report', '.filer/report.html')
  .option('--scope <path>',        'Limit to a specific directory')
  .option('--parallel <n>',        'Process N modules concurrently (default: 1)')
  .option('--no-open',             'Do not auto-open report in browser')
  .option('--fast',                'Use indexing model — faster and cheaper')
  .option('--force',               'Re-scan already-scanned files')
  .option('--ci',                  'Exit non-zero if findings meet the fail threshold')
  .option('--fail-on <severity>',  'Failure threshold: critical|high|medium (default: high)', 'high')
  .action((options) => scanCommand(options).catch(err));

// ── Context packing ───────────────────────────────────────────────────────────

program
  .command('pack')
  .description('Pack codebase into AI-ready context — replaces repomix and codebase-digest')
  .option('--scope <path>',              'Limit to a specific directory')
  .option('--include <patterns>',        'Include glob patterns (comma-separated)')
  .option('--ignore <patterns>',         'Additional ignore patterns (comma-separated)')
  .option('--output <file>',             'Write to file (default: stdout)')
  .option('--format <fmt>',              'Output format: markdown|xml|json|plain (default: markdown)')
  .option('--task <description>',        'Select only files relevant to this task (LLM-powered)')
  .option('--tokens <n>',                'Token budget — fit output within N tokens')
  .option('--annotate <depth>',          'Annotation depth: summary|full (default: summary)')
  .option('--no-annotate',               'Skip knowledge annotations (pure code dump)')
  .option('--compress',                  'Remove comments and empty lines')
  .option('--remove-comments',           'Strip comments only')
  .option('--remove-empty-lines',        'Strip empty lines only')
  .option('--line-numbers',              'Prefix each line with its line number')
  .option('--sort-by-changes',           'Sort files by git change frequency (most changed first)')
  .option('--include-git-log',           'Append recent git commit log')
  .option('--include-git-log-count <n>', 'Number of commits to include (default: 20)')
  .option('--include-git-diff',          'Append current working diff')
  .option('--remote <url>',              'Clone and pack a remote GitHub repo (e.g. user/repo)')
  .option('--branch <name>',             'Branch/tag/commit to use with --remote')
  .option('--split <size>',              'Split output into parts (e.g. 500kb, 2mb)')
  .option('--top-files <n>',             'Show N largest files in summary (default: 5)')
  .option('--max-file-size <kb>',        'Skip files above this size in KB (default: 500)')
  .option('--no-gitignore',              'Do not respect .gitignore')
  .option('--no-security-check',         'Skip secretlint scan for hardcoded secrets before packing')
  .option('--no-instructions',           'Skip prepending filer.md instructions')
  .option('--instructions <path>',       'Custom instruction file to prepend')
  .option('--header-text <text>',        'Custom header text')
  .option('--stats',                     'Show token counts per file without generating output')
  .option('--copy',                      'Copy output to clipboard')
  .option('--quiet',                     'Suppress progress output')
  .action((options) => packCommand(options).catch(err));

// ── Knowledge access ──────────────────────────────────────────────────────────

program
  .command('show [id]')
  .description('Display one or more knowledge nodes')
  .option('--type <types>',  'Filter by node type(s), comma-separated')
  .option('--scope <path>',  'Filter by scope path')
  .option('--verified',      'Show only verified nodes')
  .option('--json',          'Output raw JSON')
  .action((id, options) => showCommand(id, options));

program
  .command('export')
  .description('Export knowledge nodes as Markdown — paste into any agent context window')
  .option('--type <types>',  'Export only specific node types (comma-separated)')
  .option('--scope <path>',  'Limit to a specific scope path')
  .option('--verified',      'Export only verified nodes')
  .option('--output <path>', 'Write to a file instead of stdout')
  .option('--no-header',     'Omit the file header (for embedding in existing docs)')
  .action((options) => exportCommand(options).catch(err));

program
  .command('query <question>')
  .description('Ask a natural language question about the codebase knowledge')
  .option('--type <types>',  'Filter nodes by type(s), comma-separated')
  .option('--scope <path>',  'Limit to a specific scope path')
  .option('--no-llm',        'Skip LLM synthesis, return keyword-matched nodes only')
  .option('--json',          'Output raw JSON')
  .action((question, options) => queryCommand(question, options).catch(err));

// ── Curation ──────────────────────────────────────────────────────────────────

program
  .command('review')
  .description('Review knowledge nodes — HTML UI (default) or interactive CLI (--tty)')
  .option('--tty',                 'Interactive CLI review — approve/reject/skip one by one')
  .option('--type <types>',        'Review only specific node types (comma-separated)')
  .option('--stale',               'Include only potentially stale nodes')
  .option('--unverified-only',     'Include only unverified nodes')
  .option('--apply',               'Commit decisions from a reviewed pending.json')
  .option('--no-open',             'Do not auto-open the HTML report in browser')
  .option('--output <path>',       'Output path for HTML report', '.filer/review/report.html')
  .action((options) => reviewCommand(options).catch(err));

// ── Learning & measurement ────────────────────────────────────────────────────

program
  .command('learn')
  .description('Learn from PR review comments — propose new knowledge nodes')
  .option('--since <date>',      'Only fetch PRs merged after this date (YYYY-MM-DD)')
  .option('--pr <number>',       'Fetch a specific PR by number')
  .option('--from-file <path>',  'Load raw review comments from a file (GitLab, Bitbucket, Slack exports)')
  .option('--auto-apply',        'Auto-apply nodes with confidence >= 0.85')
  .option('--dry-run',           'Show proposals without writing nodes')
  .action((options) => learnCommand(options).catch(err));

program
  .command('measure')
  .description('Compute productivity metrics from GitHub PR history')
  .option('--since <date>',         'Only analyse PRs merged after this date (YYYY-MM-DD)')
  .option('--before <date>',        'Only analyse PRs merged before this date (YYYY-MM-DD)')
  .option('--before-after <date>',  'Compare metrics before and after this pivot date')
  .option('--pr <number>',          'Analyse a single PR by number')
  .action((options) => measureCommand(options).catch(err));

program
  .command('benchmark')
  .description('Score LLM responses with vs. without Filer context loaded')
  .option('--task <n>',       'Task: implement-feature | review-code | debug-issue')
  .option('--scope <path>',   'Scope to load knowledge nodes from (auto-detected if not set)')
  .option('--runs <n>',       'Number of runs per variant', '3')
  .option('--output <file>',  'Save full report as JSON to this path')
  .option('--dry-run',        'Show what would run without making API calls')
  .action((options) => benchmarkCommand(options).catch(err));

// ── Automation ────────────────────────────────────────────────────────────────

program
  .command('agent')
  .description('Run the Filer agent — ReAct loop (no --event) or CI orchestrator (--event)')
  .option('--event <type>',        'Event: commit | pr_merged | ci | scheduled')
  .option('--pr <number>',         'PR number (for pr_merged event)')
  .option('--since <ref>',         'Git ref to diff from (for commit event)')
  .option('--auto-apply',          'Auto-apply learned nodes with confidence >= 0.85')
  .option('--dry-run',             'Preview decisions without executing')
  .option('--fail-on <severity>',  'CI failure threshold: critical|high|medium (default: high)', 'high')
  .action((options) => agentCommand(options).catch(err));

// ── Integration ───────────────────────────────────────────────────────────────

program
  .command('hook <action>')
  .description('Manage git post-commit hook: install | uninstall | status')
  .action((action) => hookCommand(action).catch(err));

program
  .command('mcp')
  .description('Start the MCP server (stdio) for Claude Code / Cursor')
  .action(() => mcpCommand().catch(e => { console.error('MCP server error:', e.message); process.exit(1); }));

// ── Silent aliases (backwards compatibility) ──────────────────────────────────
// filer index  → filer layer
// filer update → filer layer --update
// filer verify → filer review --tty

program
  .command('index', { hidden: true })
  .description('Alias for: filer layer')
  .option('--scope <path>').option('--force').option('--dry-run')
  .option('--cost').option('--parallel <n>', '', '1').option('--fast')
  .action((options) => indexCommand(options).catch(err));

program
  .command('update', { hidden: true })
  .description('Alias for: filer layer --update')
  .option('--since <ref>').option('--silent').option('--check-stale')
  .action((options) => updateCommand(options).catch(e => {
    if (!options.silent) err(e); else process.exit(1);
  }));

program
  .command('verify', { hidden: true })
  .description('Alias for: filer review --tty')
  .option('--type <types>').option('--stale').option('--unverified-only')
  .action((options) => verifyCommand(options).catch(err));

// ── Default action ────────────────────────────────────────────────────────────

program.action(async () => {
  const root = process.cwd();
  if (!filerExists(root)) await wizardCommand();
  else await statsCommand();
});

program.parseAsync(process.argv).catch((e) => {
  console.error('\n  Error:', e.message, '\n');
  process.exit(1);
});
