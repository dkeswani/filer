// filer layer — primary command for building and maintaining the knowledge layer
// Absorbs: filer index (build), filer update (--update flag)
// filer index and filer update remain as silent aliases

import chalk from 'chalk';
import { markStale } from '../store/mod.js';
import { runIndex, runUpdate } from '../pipeline/indexer.js';
import { groupIntoModules, scanFiles, getChangedFiles } from '../pipeline/scanner.js';
import { ensureConfig } from './utils.js';

export interface LayerOptions {
  // Build mode (default)
  scope?:           string;
  force?:           boolean;
  dryRun?:          boolean;
  cost?:            boolean;
  parallel?:        string;
  fast?:            boolean;
  detectConflicts?: boolean;  // --detect-conflicts: LLM check for contradicting node pairs
  // Update mode
  update?:      boolean;   // --update: incremental re-index from last commit
  since?:       string;    // --since <ref>: git ref to diff from
  checkStale?:  boolean;   // --check-stale: LLM staleness check after update
  silent?:      boolean;   // --silent: suppress output (git hook use)
}

export async function layerCommand(options: LayerOptions): Promise<void> {
  const root   = process.cwd();
  const config = ensureConfig(root);

  // ── --update mode: incremental re-index from last commit ──────────────────
  if (options.update) {
    const changed = getChangedFiles(root, options.since ?? 'HEAD~1');

    if (changed.length === 0) {
      if (!options.silent) console.log(chalk.dim('\n  No changed files — knowledge layer is current.\n'));
      return;
    }

    if (!options.silent) {
      console.log(chalk.bold('\n  filer layer --update\n'));
      console.log(chalk.dim(`  Changed files: ${changed.length}`));
      for (const f of changed.slice(0, 5)) console.log(chalk.dim(`    · ${f}`));
      if (changed.length > 5) console.log(chalk.dim(`    · ... and ${changed.length - 5} more`));
      console.log();
    }

    markStale(root, changed);
    const result = await runUpdate(root, { silent: options.silent, checkStale: options.checkStale });

    if (!options.silent) {
      console.log('\n  ' + chalk.bold('Done\n'));
      console.log(`  ${chalk.green('✓')} Nodes created: ${result.nodes_created}`);
      console.log(`  ${chalk.dim('↻')} Nodes updated: ${result.nodes_updated}`);
      if (result.estimated_usd > 0) console.log(`  ${chalk.dim(`Cost: $${result.estimated_usd.toFixed(4)}`)}`);
      console.log();
    }
    return;
  }

  // ── --cost: estimate tokens and API cost without indexing ─────────────────
  if (options.cost) {
    console.log(chalk.bold('\n  filer layer — Cost Estimate\n'));
    const files   = await scanFiles(root, config);
    const modules = groupIntoModules(files, config);
    const tokens  = modules.reduce((s, m) => s + m.tokens, 0);

    const models = [
      { label: 'Full build (deep model)',   name: config.llm.deep_model,     usd: tokens / 1_000_000 * 3.00 + tokens * 0.2 / 1_000_000 * 15.00 },
      { label: 'Fast build (cheap model)',  name: config.llm.indexing_model, usd: tokens / 1_000_000 * 0.80 + tokens * 0.2 / 1_000_000 * 4.00  },
    ];

    console.log(`  Files:    ${files.length}`);
    console.log(`  Modules:  ${modules.length}`);
    console.log(`  Tokens:   ~${tokens.toLocaleString()} (estimated input)\n`);
    for (const m of models) {
      console.log(`  ${chalk.dim(m.label)}`);
      console.log(`  ${chalk.cyan(m.name.padEnd(40))} ~$${m.usd.toFixed(4)}\n`);
    }
    return;
  }

  // ── Default: full build / rebuild ─────────────────────────────────────────
  console.log(chalk.bold('\n  filer layer\n'));
  if (options.scope) console.log(chalk.dim(`  Scope: ${options.scope}`));
  if (options.fast)  console.log(chalk.dim('  Mode: fast (indexing model for all tasks)'));

  const concurrency = options.parallel ? parseInt(options.parallel, 10) : 1;
  if (concurrency > 1) console.log(chalk.dim(`  Concurrency: ${concurrency} modules in parallel`));

  const result = await runIndex({
    root,
    scope:            options.scope,
    force:            options.force,
    dryRun:           options.dryRun,
    concurrency,
    fast:             options.fast,
    detectConflicts:  options.detectConflicts,
  });

  if (options.dryRun) return;

  console.log('\n  ' + chalk.bold('Done\n'));
  console.log(`  ${chalk.green('✓')} Modules processed: ${result.modules_processed}`);
  console.log(`  ${chalk.green('✓')} Nodes created:     ${result.nodes_created}`);
  console.log(`  ${chalk.dim('↻')} Nodes updated:     ${result.nodes_updated}`);

  if (result.nodes_rejected > 0) {
    console.log(`  ${chalk.yellow('⚠')} Nodes rejected:    ${result.nodes_rejected} ${chalk.dim('(below confidence threshold)')}`);
  }
  if (result.nodes_conflicted > 0) {
    console.log(`  ${chalk.red('⚡')} Nodes conflicted:  ${result.nodes_conflicted} ${chalk.dim('(queued for review — run filer review)')}`);
  }
  if (result.errors.length > 0) {
    console.log(`\n  ${chalk.red('✗')} Errors: ${result.errors.length}`);
    for (const err of result.errors) console.log(chalk.red(`    · ${err}`));
  }

  console.log(`\n  ${chalk.dim(`Estimated cost: $${result.estimated_usd.toFixed(4)}`)}`);
  console.log(`\n  Next: ${chalk.cyan('filer stats')} or ${chalk.cyan('filer review')}\n`);
}
