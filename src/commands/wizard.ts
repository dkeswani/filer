import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import {
  filerExists,
  readAllNodes,
  readConfig,
} from '../store/mod.js';
import { initCommand } from './init.js';
import { scanFiles, groupIntoModules } from '../pipeline/scanner.js';
import { runIndex } from '../pipeline/indexer.js';
import type { AnyNode } from '../schema/mod.js';

// ── Project type detection ────────────────────────────────────────────────────

export type ProjectType =
  | 'Next.js'
  | 'Python/FastAPI'
  | 'Express'
  | 'Go'
  | 'Rust'
  | 'TypeScript'
  | 'JavaScript'
  | 'Mixed';

export function detectProjectType(root: string): ProjectType {
  const has = (f: string) => fs.existsSync(path.join(root, f));
  const glob = (pattern: string) => {
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      return entries.some(e => e.name.match(pattern));
    } catch { return false; }
  };

  if (has('next.config.js') || has('next.config.ts') || has('next.config.mjs') ||
      has('frontend/next.config.js') || has('frontend/next.config.ts')) {
    return 'Next.js';
  }

  if (has('go.mod')) return 'Go';
  if (has('Cargo.toml')) return 'Rust';

  if (has('requirements.txt') || has('pyproject.toml') || has('setup.py')) {
    return 'Python/FastAPI';
  }

  // Check for Python files in backend/
  if (has('backend') && fs.existsSync(path.join(root, 'backend'))) {
    try {
      const backendFiles = fs.readdirSync(path.join(root, 'backend'));
      if (backendFiles.some(f => f.endsWith('.py'))) return 'Python/FastAPI';
    } catch {}
  }

  if (has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['express']) return 'Express';
      if (deps['typescript'] || has('tsconfig.json')) return 'TypeScript';
      return 'JavaScript';
    } catch {}
    return 'JavaScript';
  }

  return 'Mixed';
}

// ── Provider env var map ──────────────────────────────────────────────────────

const PROVIDER_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai:    'OPENAI_API_KEY',
  kimi:      'MOONSHOT_API_KEY',
  ollama:    '',
};

// ── Countdown timer ───────────────────────────────────────────────────────────

async function countdownProceed(seconds: number): Promise<boolean> {
  return new Promise(resolve => {
    let remaining = seconds;
    let resolved  = false;

    const rl = createInterface({ input: process.stdin });
    process.stdin.setRawMode?.(true);

    const done = (proceed: boolean) => {
      if (resolved) return;
      resolved = true;
      clearInterval(timer);
      process.stdin.setRawMode?.(false);
      rl.close();
      process.stdout.write('\n');
      resolve(proceed);
    };

    process.stdin.once('data', (key: Buffer) => {
      const k = key.toString();
      if (k === '\r' || k === '\n' || k === ' ') {
        done(true);
      } else if (k === '\u0003') {
        // Ctrl+C
        done(false);
      }
    });

    const bar = (secs: number) => {
      const total = seconds;
      const filled = total - secs;
      const width  = 20;
      const f = Math.round((filled / total) * width);
      const e = width - f;
      return chalk.cyan('█'.repeat(f)) + chalk.dim('░'.repeat(e));
    };

    process.stdout.write(`  ${bar(remaining)}  ${remaining}s  (Enter to proceed, Ctrl+C to cancel)\r`);

    const timer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        done(true);
      } else {
        process.stdout.write(`  ${bar(remaining)}  ${remaining}s  (Enter to proceed, Ctrl+C to cancel)\r`);
      }
    }, 1000);
  });
}

// ── inquirer-style prompt (using readline) ────────────────────────────────────

function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function select(question: string, choices: string[], defaultIdx = 0): Promise<string> {
  console.log(question);
  choices.forEach((c, i) => {
    const marker = i === defaultIdx ? chalk.cyan('❯') : ' ';
    console.log(`  ${marker} ${c}`);
  });
  const answer = await prompt(chalk.dim(`  Choice [1-${choices.length}] (default ${defaultIdx + 1}): `));
  const idx = parseInt(answer, 10) - 1;
  return choices[isNaN(idx) || idx < 0 || idx >= choices.length ? defaultIdx : idx];
}

// ── Top finding picker ────────────────────────────────────────────────────────

export function pickTopFinding(nodes: AnyNode[]): AnyNode | null {
  // 1. Critical security, confidence ≥ 0.90
  const critSecurity = nodes.find(
    n => n.type === 'security' && (n as any).severity === 'critical' && n.confidence >= 0.90
  );
  if (critSecurity) return critSecurity;

  // 2. High severity security
  const highSecurity = nodes.find(n => n.type === 'security' && (n as any).severity === 'high');
  if (highSecurity) return highSecurity;

  // 3. Unverified constraint, confidence ≥ 0.90
  const constraint = nodes.find(n => n.type === 'constraint' && n.confidence >= 0.90 && !n.verified);
  if (constraint) return constraint;

  // 4. Danger, confidence ≥ 0.90
  const danger = nodes.find(n => n.type === 'danger' && n.confidence >= 0.90);
  if (danger) return danger;

  return null;
}

function getNodeStatement(node: AnyNode): string {
  switch (node.type) {
    case 'security':    return (node as any).statement;
    case 'constraint':  return (node as any).statement;
    case 'danger':      return (node as any).statement;
    default:            return (node as any).statement ?? '';
  }
}

function getNodeConsequence(node: AnyNode): string {
  switch (node.type) {
    case 'security':   return (node as any).if_violated ?? '';
    case 'constraint': return (node as any).if_violated ?? '';
    case 'danger':     return (node as any).condition ?? '';
    default:           return '';
  }
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export async function wizardCommand(): Promise<void> {
  const root = process.cwd();

  console.log(chalk.bold('\n  Filer — the knowledge layer for codebases\n'));
  console.log(chalk.dim('  This wizard will extract structured knowledge from your codebase'));
  console.log(chalk.dim('  and make it available to AI agents as context.\n'));

  // ── Step 1: Detect project type ────────────────────────────────────────────
  const projectType = detectProjectType(root);
  console.log(chalk.green('  ✓') + '  Detected project: ' + chalk.bold(projectType));

  // ── Step 2: Choose provider ────────────────────────────────────────────────
  const providerChoice = await select(
    '\n  Which LLM provider?',
    ['Anthropic (Claude) — recommended', 'OpenAI (GPT-4o)', 'Kimi (kimi-k2.6, ~80% cheaper)', 'Ollama (local)'],
    0
  );
  const provider = providerChoice.includes('Anthropic') ? 'anthropic'
    : providerChoice.includes('OpenAI') ? 'openai'
    : providerChoice.includes('Kimi') ? 'kimi'
    : 'ollama';

  // ── Step 3: API key ────────────────────────────────────────────────────────
  const envVar = PROVIDER_ENV[provider];
  let apiKey = envVar ? process.env[envVar] : 'local';

  if (envVar && apiKey) {
    console.log(chalk.green('\n  ✓') + `  ${envVar} found in environment`);
  } else if (envVar) {
    console.log(chalk.yellow(`\n  ${envVar} not set.`));
    const key = await prompt(`  Enter your API key (or press Enter to skip): `);
    if (key) {
      apiKey = key;
      // Write to .env
      const envPath = path.join(root, '.env');
      const line    = `${envVar}=${key}\n`;
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        if (!content.includes(envVar)) {
          fs.appendFileSync(envPath, line);
        }
      } else {
        fs.writeFileSync(envPath, line);
      }
      // Ensure .gitignore has .env
      ensureGitignoreEntry(root, '.env');
      process.env[envVar] = key;
      console.log(chalk.green('  ✓') + `  Saved to .env (excluded from git)`);
    } else {
      console.log(chalk.yellow('  Skipping API key — you can set it later and run: filer index'));
    }
  }

  // ── Step 4: Run init silently ──────────────────────────────────────────────
  console.log(chalk.dim('\n  Initializing .filer/ directory structure...'));
  await initCommand({ provider, noHook: false, force: false });

  // ── Step 5: Cost estimate + countdown ─────────────────────────────────────
  if (apiKey) {
    const config = readConfig(root);
    if (config) {
      try {
        const files   = await scanFiles(root, config);
        const modules = groupIntoModules(files, config);
        const tokens  = modules.reduce((s, m) => s + m.tokens, 0);
        const cost    = (tokens / 1_000_000 * 3.00 + tokens * 0.2 / 1_000_000 * 15.00).toFixed(2);

        console.log(chalk.bold(`\n  Indexing ${modules.length} modules — estimated cost: ~$${cost}\n`));

        const proceed = await countdownProceed(5);
        if (!proceed) {
          console.log(chalk.yellow('\n  Cancelled. Run `filer index` when ready.\n'));
          return;
        }
      } catch {
        // If scan fails, proceed anyway
        const proceed = await countdownProceed(5);
        if (!proceed) {
          console.log(chalk.yellow('\n  Cancelled. Run `filer index` when ready.\n'));
          return;
        }
      }

      // ── Step 6: Run index ────────────────────────────────────────────────
      console.log(chalk.bold('\n  Building knowledge layer...\n'));
      try {
        const result = await runIndex({ root, silent: false });

        // ── Step 7: Show summary ─────────────────────────────────────────
        console.log(chalk.bold('\n  ✓ Done\n'));
        console.log(`  Nodes created: ${chalk.green(String(result.nodes_created))}`);
        console.log(`  Nodes updated: ${chalk.dim(String(result.nodes_updated))}`);
        if (result.estimated_usd > 0) {
          console.log(`  Actual cost:   ${chalk.dim('$' + result.estimated_usd.toFixed(4))}`);
        }

        // ── Step 8: Top finding ──────────────────────────────────────────
        const nodes    = readAllNodes(root);
        const topNode  = pickTopFinding(nodes);

        if (topNode) {
          const typeColor = topNode.type === 'security' ? chalk.red
            : topNode.type === 'constraint' ? chalk.yellow : chalk.magenta;

          console.log(chalk.bold('\n  Most important finding:\n'));
          console.log(
            typeColor(`  [${topNode.type.toUpperCase()}] `) +
            chalk.bold(topNode.id) +
            chalk.dim(`  confidence: ${Math.round(topNode.confidence * 100)}%`)
          );
          console.log('  ' + getNodeStatement(topNode));
          const consequence = getNodeConsequence(topNode);
          if (consequence) console.log(chalk.dim('  ' + consequence));

          if (topNode.type === 'security') {
            console.log(chalk.dim('\n  → Run: filer verify --type security'));
          } else {
            console.log(chalk.dim('\n  → Run: filer verify'));
          }
        }

      } catch (err: any) {
        console.log(chalk.yellow(`\n  Index skipped: ${err.message}`));
        console.log(chalk.dim('  Run `filer index` to build the knowledge layer.\n'));
      }
    }
  }

  // ── Step 9: Next steps ─────────────────────────────────────────────────────
  console.log(chalk.bold('\n  Next steps:\n'));
  console.log('  ' + chalk.cyan('filer stats') + chalk.dim('                — view coverage dashboard'));
  console.log('  ' + chalk.cyan('filer verify') + chalk.dim('               — review extracted nodes'));
  console.log('  ' + chalk.cyan('filer query "<question>"') + chalk.dim('   — ask about the codebase'));
  console.log();
  console.log(chalk.dim('  Add to your CLAUDE.md or AGENTS.md:'));
  console.log(chalk.dim('    Before writing code, read filer.md and follow the loading protocol.'));
  console.log();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureGitignoreEntry(root: string, entry: string): void {
  const p = path.join(root, '.gitignore');
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, `${entry}\n`);
    return;
  }
  const content = fs.readFileSync(p, 'utf-8');
  if (!content.split('\n').some(l => l.trim() === entry)) {
    fs.appendFileSync(p, `\n${entry}\n`);
  }
}
