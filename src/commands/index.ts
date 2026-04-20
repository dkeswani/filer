import chalk from 'chalk';
import { filerExists, readConfig } from '../store/mod.js';
import { runIndex }                from '../pipeline/indexer.js';
import { groupIntoModules, scanFiles } from '../pipeline/scanner.js';

interface IndexOptions {
  scope?:    string;
  type?:     string;
  force?:    boolean;
  dryRun?:   boolean;
  cost?:     boolean;
  parallel?: string;
  fast?:     boolean;
}

export async function indexCommand(options: IndexOptions): Promise<void> {
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

  // Cost estimate mode — no API calls
  if (options.cost) {
    console.log(chalk.bold('\n  Filer Index — Cost Estimate\n'));
    const files   = await scanFiles(root, config);
    const modules = groupIntoModules(files, config);
    const tokens  = modules.reduce((s, m) => s + m.tokens, 0);

    const models = [
      { name: config.llm.deep_model,     label: 'Deep model (full index)',  usd: tokens / 1_000_000 * 3.00 + tokens * 0.2 / 1_000_000 * 15.00 },
      { name: config.llm.indexing_model, label: 'Indexing model (update)',  usd: tokens / 1_000_000 * 0.80 + tokens * 0.2 / 1_000_000 * 4.00  },
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

  console.log(chalk.bold('\n  Filer Index\n'));

  if (options.scope) {
    console.log(chalk.dim(`  Scope: ${options.scope}`));
  }

  const concurrency = options.parallel ? parseInt(options.parallel, 10) : 1;

  if (options.fast) {
    console.log(chalk.dim('  Mode: fast (indexing model for all tasks)'));
  }
  if (concurrency > 1) {
    console.log(chalk.dim(`  Concurrency: ${concurrency} modules in parallel`));
  }

  const result = await runIndex({
    root,
    scope:       options.scope,
    force:       options.force,
    dryRun:      options.dryRun,
    concurrency,
    fast:        options.fast,
  });

  if (options.dryRun) return;

  // Summary
  console.log('\n  ' + chalk.bold('Done\n'));
  console.log(`  ${chalk.green('✓')} Modules processed: ${result.modules_processed}`);
  console.log(`  ${chalk.green('✓')} Nodes created:     ${result.nodes_created}`);
  console.log(`  ${chalk.dim('↻')} Nodes updated:     ${result.nodes_updated}`);

  if (result.nodes_rejected > 0) {
    console.log(`  ${chalk.yellow('⚠')} Nodes rejected:    ${result.nodes_rejected} ${chalk.dim('(below confidence threshold)')}`);
  }

  if (result.errors.length > 0) {
    console.log(`\n  ${chalk.red('✗')} Errors: ${result.errors.length}`);
    for (const err of result.errors) {
      console.log(chalk.red(`    · ${err}`));
    }
  }

  console.log(`\n  ${chalk.dim(`Estimated cost: $${result.estimated_usd.toFixed(4)}`)}`);
  console.log(`\n  Next: ${chalk.cyan('filer stats')} or ${chalk.cyan('filer verify')}\n`);
}
