import path   from 'path';
import chalk  from 'chalk';
import ora    from 'ora';
import { scanFiles }        from '../pipeline/scanner.js';
import { ensureConfig }     from './utils.js';
import { scanForSecrets }   from '../security/secretlint.js';

interface SecretsOptions {
  scope?:   string;
  json?:    boolean;
  ci?:      boolean;
}

export async function secretsCommand(options: SecretsOptions): Promise<void> {
  const root   = process.cwd();
  const config = ensureConfig(root);

  console.log(chalk.bold('\n  Filer Secrets\n'));

  const scanSpinner = ora('  Scanning files...').start();
  const sourceFiles = await scanFiles(root, config);
  const filtered = options.scope
    ? sourceFiles.filter(f => f.path.startsWith(options.scope!))
    : sourceFiles;
  scanSpinner.succeed(`  Found ${filtered.length} files`);

  const secSpinner = ora('  Scanning for hardcoded secrets...').start();
  const { findings, fileCount } = await scanForSecrets(
    filtered.map(f => ({ path: f.path, content: f.content }))
  );

  if (findings.length === 0) {
    secSpinner.succeed('  No hardcoded secrets detected\n');
    if (options.json) process.stdout.write(JSON.stringify({ findings: [], fileCount }, null, 2) + '\n');
    return;
  }

  secSpinner.warn(`  ${findings.length} potential secret(s) detected in ${fileCount} files scanned\n`);

  if (options.json) {
    process.stdout.write(JSON.stringify({ findings, fileCount }, null, 2) + '\n');
    if (options.ci) process.exit(1);
    return;
  }

  // Group by file for readable output
  const byFile = new Map<string, typeof findings>();
  for (const f of findings) {
    if (!byFile.has(f.filePath)) byFile.set(f.filePath, []);
    byFile.get(f.filePath)!.push(f);
  }

  for (const [file, hits] of byFile) {
    console.log(`  ${chalk.cyan(file)}`);
    for (const h of hits) {
      const sev = h.severity === 'error' ? chalk.red('CRITICAL') : chalk.yellow('WARNING ');
      console.log(`    ${sev}  line ${String(h.line).padEnd(5)}  ${h.ruleId}`);
      console.log(`             ${chalk.dim(h.message.slice(0, 100))}`);
    }
    console.log();
  }

  console.log(chalk.yellow(`  Action required: rotate any leaked credentials and remove from source control.`));
  console.log(chalk.dim(`  Use git filter-repo or BFG to purge from history.\n`));

  if (options.ci) {
    console.error(chalk.red(`  CI: ${findings.length} secret(s) found. Exiting 1.\n`));
    process.exit(1);
  }
}
