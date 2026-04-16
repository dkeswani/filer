import chalk from 'chalk';
import { filerExists }  from '../store/mod.js';
import { runUpdate }    from '../pipeline/indexer.js';
import { markStale, readConfig } from '../store/mod.js';
import { getChangedFiles } from '../pipeline/scanner.js';

interface UpdateOptions {
  since?:  string;
  silent?: boolean;
}

export async function updateCommand(options: UpdateOptions): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    if (!options.silent) {
      console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
    }
    process.exit(1);
  }

  const changed = getChangedFiles(root, options.since ?? 'HEAD~1');

  if (changed.length === 0) {
    if (!options.silent) {
      console.log(chalk.dim('\n  No changed files — nothing to update.\n'));
    }
    return;
  }

  if (!options.silent) {
    console.log(chalk.bold('\n  Filer Update\n'));
    console.log(chalk.dim(`  Changed files: ${changed.length}`));
    for (const f of changed.slice(0, 5)) {
      console.log(chalk.dim(`    · ${f}`));
    }
    if (changed.length > 5) {
      console.log(chalk.dim(`    · ... and ${changed.length - 5} more`));
    }
    console.log();
  }

  // Mark existing nodes as potentially stale
  markStale(root, changed);

  // Re-index only changed files
  const result = await runUpdate(root, { silent: options.silent });

  if (!options.silent) {
    console.log('\n  ' + chalk.bold('Done\n'));
    console.log(`  ${chalk.green('✓')} Nodes created: ${result.nodes_created}`);
    console.log(`  ${chalk.dim('↻')} Nodes updated: ${result.nodes_updated}`);
    if (result.estimated_usd > 0) {
      console.log(`  ${chalk.dim(`Cost: $${result.estimated_usd.toFixed(4)}`)}`);
    }
    console.log();
  }
}
