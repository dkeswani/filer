import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { writeNode, readNode, ensureFilerDirs } from '../store/mod.js';
import { loadTemplate, resolveCategories } from './loader.js';
import { FILER_DIR } from '../schema/mod.js';

export interface InstallResult {
  installed: number;
  skipped: number;
}

export async function installTemplates(
  root: string,
  categoryInput: string
): Promise<InstallResult> {
  const categories = categoryInput.split(',').map(c => c.trim()).filter(Boolean);

  const templatePaths = resolveCategories(categories);

  const resolvedLabels = categories.map(c => (c === 'all' ? 'all (except meta)' : c)).join(', ');
  console.log(chalk.dim(`  ↳ installing template categories: ${resolvedLabels}`));

  ensureFilerDirs(root);

  let installed = 0;
  let skipped = 0;

  for (const tplPath of templatePaths) {
    const node = loadTemplate(tplPath);
    const existing = readNode(root, node.id);

    if (existing) {
      console.log(chalk.yellow('  ⚠') + chalk.dim(`  ${tplPath}.json (skipped — id already exists: ${node.id})`));
      skipped++;
      continue;
    }

    writeNode(root, node);
    console.log(chalk.green('  ✓') + chalk.dim(`  ${tplPath}.json`));
    installed++;
  }

  console.log('');
  if (installed > 0) {
    console.log(`  ${chalk.bold(String(installed))} template${installed === 1 ? '' : 's'} installed. Review and adapt the ${chalk.cyan('scope')} field on each.`);
    console.log(chalk.dim(`  Mark verified after applying to your codebase: filer verify <node-id>`));
  }
  if (skipped > 0) {
    console.log(chalk.yellow(`  ${skipped} skipped (already present).`));
  }

  return { installed, skipped };
}
