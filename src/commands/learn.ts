import chalk from 'chalk';

interface LearnOptions {
  since?:      string;
  pr?:         string;
  autoApply?:  boolean;
  dryRun?:     boolean;
}

export async function learnCommand(options: LearnOptions): Promise<void> {
  console.log(chalk.yellow('\n  filer learn — not yet implemented (Days 14–15)\n'));
  console.log(chalk.dim('  This command will:'));
  console.log(chalk.dim('  1. Fetch PR review comments from GitHub'));
  console.log(chalk.dim('  2. Classify institutional knowledge signals (Haiku)'));
  console.log(chalk.dim('  3. Cluster signals by semantic similarity'));
  console.log(chalk.dim('  4. Cross-reference clusters against existing .filer/ nodes'));
  console.log(chalk.dim('  5. Propose new/updated nodes (Sonnet)'));
  console.log(chalk.dim('  6. Interactive apply workflow\n'));
  console.log(chalk.dim('  Requires: GITHUB_TOKEN env var\n'));
  process.exit(0);
}
