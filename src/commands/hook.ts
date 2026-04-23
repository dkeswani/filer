import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

const HOOK_MARKER = '# Filer: update knowledge nodes after each commit';
const HOOK_CONTENT = `#!/bin/sh
${HOOK_MARKER}
if command -v filer >/dev/null 2>&1; then
  filer layer --update --silent
fi
`;

export async function hookCommand(action: string): Promise<void> {
  const root = process.cwd();
  const hooksDir = path.join(root, '.git', 'hooks');
  const hookPath = path.join(hooksDir, 'post-commit');

  switch (action) {
    case 'install':
      return install(hooksDir, hookPath);
    case 'uninstall':
      return uninstall(hookPath);
    case 'status':
      return status(hookPath);
    default:
      console.error(chalk.red(`\n  Unknown action: ${action}`));
      console.error(chalk.dim('  Use: filer hook install | uninstall | status\n'));
      process.exit(1);
  }
}

function install(hooksDir: string, hookPath: string): void {
  if (!fs.existsSync(hooksDir)) {
    console.error(chalk.red('\n  No .git/hooks/ directory found. Is this a git repo?\n'));
    process.exit(1);
  }

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf-8');
    if (existing.includes(HOOK_MARKER)) {
      console.log(chalk.yellow('\n  Filer post-commit hook is already installed.\n'));
      return;
    }
    // Append to existing hook
    fs.appendFileSync(hookPath, '\n' + HOOK_CONTENT);
    console.log(chalk.green('\n  ✓ Appended Filer hook to existing post-commit hook.\n'));
    return;
  }

  fs.writeFileSync(hookPath, HOOK_CONTENT, { mode: 0o755 });
  console.log(chalk.green('\n  ✓ Installed git post-commit hook.\n'));
  console.log(chalk.dim('  filer layer --update --silent will run after each commit.\n'));
}

function uninstall(hookPath: string): void {
  if (!fs.existsSync(hookPath)) {
    console.log(chalk.dim('\n  No post-commit hook found.\n'));
    return;
  }

  const content = fs.readFileSync(hookPath, 'utf-8');
  if (!content.includes(HOOK_MARKER)) {
    console.log(chalk.yellow('\n  Filer hook not found in post-commit hook.\n'));
    return;
  }

  // Remove filer block
  const cleaned = content
    .replace(new RegExp(`\\n?${escapeRegex(HOOK_CONTENT)}`, 'g'), '')
    .replace(new RegExp(`${escapeRegex(HOOK_CONTENT)}\\n?`, 'g'), '')
    .trim();

  if (cleaned.length === 0 || cleaned === '#!/bin/sh') {
    fs.unlinkSync(hookPath);
    console.log(chalk.green('\n  ✓ Removed post-commit hook (was Filer-only).\n'));
  } else {
    fs.writeFileSync(hookPath, cleaned + '\n', { mode: 0o755 });
    console.log(chalk.green('\n  ✓ Removed Filer section from post-commit hook.\n'));
  }
}

function status(hookPath: string): void {
  if (!fs.existsSync(hookPath)) {
    console.log(chalk.yellow('\n  Status: ') + chalk.dim('no post-commit hook installed\n'));
    console.log(chalk.dim('  Run: filer hook install\n'));
    return;
  }

  const content = fs.readFileSync(hookPath, 'utf-8');
  const filerInstalled = content.includes(HOOK_MARKER);

  console.log('\n  ' + chalk.bold('Git post-commit hook status'));
  console.log('  File:    ' + chalk.dim(hookPath));
  console.log('  Filer:   ' + (filerInstalled ? chalk.green('installed') : chalk.yellow('not found')));
  console.log('  Executable: ' + (isExecutable(hookPath) ? chalk.green('yes') : chalk.red('no')));
  console.log();
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
