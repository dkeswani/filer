import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import {
  filerExists,
  readConfig,
  readIndex,
  loadNodesForScope,
} from '../store/mod.js';
import { LLMGateway } from '../llm/mod.js';
import { serializeNodesForBenchmark } from './query.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BenchmarkOptions {
  scope?:  string;
  task?:   string;
  runs?:   string;
  dryRun?: boolean;
}

interface BenchmarkRun {
  score:       number;   // 0-100
  tokens:      number;
  latency_ms:  number;
  violations:  string[];
  output:      string;
}

interface BenchmarkResult {
  variant:     'without' | 'with';
  runs:        BenchmarkRun[];
  avg_score:   number;
  avg_tokens:  number;
  avg_latency: number;
  nodes_loaded: number;
}

// ── Scoring prompt ────────────────────────────────────────────────────────────

const SCORE_SYSTEM = `You are a code quality judge for the Filer benchmark system.

You will be given:
1. A coding task description
2. A code output to evaluate
3. (Optionally) Filer knowledge nodes that were available as context

Score the output from 0-100 based on:
- Correctness: does the code correctly implement the task? (40 points)
- Convention adherence: does it follow the patterns in the knowledge nodes? (30 points)
- Constraint compliance: does it avoid violating any constraints or security rules? (20 points)
- Code quality: is it clean, readable, and idiomatic? (10 points)

If no knowledge nodes are provided, score on correctness and code quality only (50/50).

List any constraint or security violations you found.

Respond with JSON only:
{
  "score": number,
  "violations": string[],
  "reasoning": string
}`;

const CODEGEN_SYSTEM = `You are an AI coding assistant. Implement the requested task as concisely and correctly as possible. Return only the code, no explanation.`;

// ── Scope detection ───────────────────────────────────────────────────────────

function detectScopes(root: string): string[] {
  const config = readConfig(root);
  if (!config) return [];

  // Extract unique top-level directories from include patterns
  const dirs = new Set<string>();
  for (const pattern of config.include) {
    // e.g. "backend/**/*.ts" → "backend"
    // e.g. "frontend/src/**/*.tsx" → "frontend/src"
    const parts = pattern.split('/**')[0].split('/*')[0];
    if (parts && !parts.startsWith('**')) {
      dirs.add(parts);
    }
  }

  return Array.from(dirs).sort();
}

function detectTaskForScope(scope: string): string {
  if (scope.includes('api') || scope.includes('routes') || scope.includes('backend')) {
    return 'Add a new API endpoint that returns paginated results with proper error handling';
  }
  if (scope.includes('component') || scope.includes('frontend') || scope.includes('ui')) {
    return 'Add a new React component that fetches and displays data from an API endpoint';
  }
  if (scope.includes('auth')) {
    return 'Add a middleware function that validates authentication and attaches user context';
  }
  if (scope.includes('db') || scope.includes('model') || scope.includes('schema')) {
    return 'Add a new database query function with proper error handling and type safety';
  }
  return 'Add a new utility function with proper error handling and TypeScript types';
}

// ── Prompt user for scope ─────────────────────────────────────────────────────

async function promptForScope(scopes: string[]): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

  console.log(chalk.bold('\n  Available scopes from your .filer config:\n'));
  scopes.forEach((s, i) => console.log(`    ${chalk.cyan(i + 1 + '.')} ${s}`));
  console.log(`    ${chalk.cyan((scopes.length + 1) + '.')} Enter manually\n`);

  const answer = (await ask(chalk.bold('  Choose scope (number or path): '))).trim();
  rl.close();

  const idx = parseInt(answer) - 1;
  if (!isNaN(idx) && idx >= 0 && idx < scopes.length) {
    return scopes[idx];
  }
  if (idx === scopes.length) {
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask2 = (q: string) => new Promise<string>(resolve => rl2.question(q, resolve));
    const manual = (await ask2(chalk.dim('  Enter path: '))).trim();
    rl2.close();
    return manual || scopes[0];
  }
  // If they typed a path directly
  if (answer && !answer.match(/^\d+$/)) return answer;
  return scopes[0];
}

// ── Single benchmark run ──────────────────────────────────────────────────────

async function runOnce(
  gateway:     LLMGateway,
  task:        string,
  nodeContext: string | null,
  scope:       string
): Promise<BenchmarkRun> {
  const start = Date.now();

  // Build the coding prompt
  const codingPrompt = nodeContext
    ? `You are working in scope: ${scope}\n\nFiler knowledge context:\n${nodeContext}\n\nTask: ${task}\n\nImplement the task following the knowledge context above.`
    : `You are working in scope: ${scope}\n\nTask: ${task}\n\nImplement the task.`;

  // Generate code
  const codeResponse = await gateway.complete(
    'extract.full',
    [{ role: 'user', content: codingPrompt }],
    { system: CODEGEN_SYSTEM, max_tokens: 1500, temperature: 0.3 }
  );

  const latency = Date.now() - start;

  // Score the output
  const scorePrompt = `Task: ${task}

Code output:
${codeResponse.content}

${nodeContext ? `Filer knowledge nodes that were available:\n${nodeContext}` : 'No Filer knowledge nodes were available (baseline run).'}

Score this code output.`;

  const scoreResponse = await gateway.complete(
    'query.answer',
    [{ role: 'user', content: scorePrompt }],
    { system: SCORE_SYSTEM, max_tokens: 500, temperature: 0 }
  );

  let score = 50;
  let violations: string[] = [];

  try {
    const { parseJSON } = await import('../llm/gateway.js');
    const parsed = parseJSON<{ score: number; violations: string[]; reasoning: string }>(
      scoreResponse.content
    );
    score      = Math.max(0, Math.min(100, parsed.score));
    violations = parsed.violations ?? [];
  } catch {
    // If parsing fails, use a default score
  }

  return {
    score,
    tokens:     codeResponse.input_tokens + codeResponse.output_tokens,
    latency_ms: latency,
    violations,
    output:     codeResponse.content,
  };
}

// ── Main benchmark command ────────────────────────────────────────────────────

export async function benchmarkCommand(options: BenchmarkOptions): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
    process.exit(1);
  }

  const config = readConfig(root);
  if (!config) {
    console.error(chalk.red('\n  No config found. Run: filer init\n'));
    process.exit(1);
  }

  // ── Resolve scope ─────────────────────────────────────────────────────────

  let scope = options.scope;

  if (!scope) {
    const scopes = detectScopes(root);

    if (scopes.length === 0) {
      console.error(chalk.red('\n  Could not detect source directories from config.'));
      console.error(chalk.dim('  Use: filer benchmark --scope backend/app/\n'));
      process.exit(1);
    }

    if (scopes.length === 1) {
      scope = scopes[0];
      console.log(chalk.dim(`\n  Auto-detected scope: ${scope}`));
    } else {
      scope = await promptForScope(scopes);
    }
  }

  // ── Verify nodes exist for scope ──────────────────────────────────────────

  const nodes = loadNodesForScope(root, [scope]);

  if (nodes.length === 0) {
    const index    = readIndex(root);
    const allScopes = [...new Set(index?.nodes.map(n => n.scope[0]).filter(Boolean) ?? [])].slice(0, 5);

    console.log(chalk.yellow(`\n  ⚠ No Filer nodes found for scope: ${scope}`));
    if (allScopes.length > 0) {
      console.log(chalk.dim('  Nodes exist for:'));
      allScopes.forEach(s => console.log(chalk.dim(`    · ${s}`)));
      console.log(chalk.dim('\n  Re-run with one of these scopes for a meaningful benchmark.'));
      console.log(chalk.dim(`  Example: filer benchmark --scope ${allScopes[0]}\n`));
    }
    process.exit(1);
  }

  // ── Resolve task ──────────────────────────────────────────────────────────

  const task = options.task ?? detectTaskForScope(scope);
  const runs = Math.max(1, Math.min(5, parseInt(options.runs ?? '3') || 3));

  console.log(chalk.bold('\n  Filer Benchmark\n'));
  console.log(`  Scope:  ${chalk.cyan(scope)}`);
  console.log(`  Task:   ${task}`);
  console.log(`  Runs:   ${runs} per variant (${runs * 2} total LLM calls)`);
  console.log(`  Nodes:  ${nodes.length} loaded for scope`);

  // Show node types loaded
  const byType: Record<string, number> = {};
  for (const node of nodes) {
    byType[node.type] = (byType[node.type] ?? 0) + 1;
  }
  const typeStr = Object.entries(byType).map(([t, c]) => `${c} ${t}`).join(', ');
  console.log(chalk.dim(`  Types:  ${typeStr}\n`));

  if (options.dryRun) {
    console.log(chalk.yellow('  Dry run — no API calls made.\n'));
    console.log(chalk.dim('  Would run:'));
    console.log(chalk.dim(`    ${runs} baseline runs (no Filer context)`));
    console.log(chalk.dim(`    ${runs} Filer runs (with ${nodes.length} nodes loaded)`));
    return;
  }

  const gateway     = new LLMGateway(config);
  const nodeContext = serializeNodesForBenchmark(nodes);

  // ── Baseline runs (without Filer) ─────────────────────────────────────────

  console.log(chalk.dim('  Running baseline (without Filer context)...'));
  const baselineRuns: BenchmarkRun[] = [];

  for (let i = 0; i < runs; i++) {
    const spinner = ora(chalk.dim(`    run ${i + 1}/${runs}`)).start();
    const result  = await runOnce(gateway, task, null, scope);
    baselineRuns.push(result);
    spinner.succeed(chalk.dim(`    run ${i + 1}/${runs}  score=${result.score}  ${result.violations.length > 0 ? chalk.red(`violations: ${result.violations.length}`) : chalk.green('no violations')}`));
  }

  // ── Filer runs (with context) ─────────────────────────────────────────────

  console.log(chalk.dim('\n  Running with Filer context...'));
  const filerRuns: BenchmarkRun[] = [];

  for (let i = 0; i < runs; i++) {
    const spinner = ora(chalk.dim(`    run ${i + 1}/${runs}`)).start();
    const result  = await runOnce(gateway, task, nodeContext, scope);
    filerRuns.push(result);
    spinner.succeed(chalk.dim(`    run ${i + 1}/${runs}  score=${result.score}  ${result.violations.length > 0 ? chalk.red(`violations: ${result.violations.length}`) : chalk.green('no violations')}`));
  }

  // ── Compute results ───────────────────────────────────────────────────────

  const avg = (arr: number[]) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

  const baselineResult: BenchmarkResult = {
    variant:      'without',
    runs:         baselineRuns,
    avg_score:    avg(baselineRuns.map(r => r.score)),
    avg_tokens:   avg(baselineRuns.map(r => r.tokens)),
    avg_latency:  avg(baselineRuns.map(r => r.latency_ms)),
    nodes_loaded: 0,
  };

  const filerResult: BenchmarkResult = {
    variant:      'with',
    runs:         filerRuns,
    avg_score:    avg(filerRuns.map(r => r.score)),
    avg_tokens:   avg(filerRuns.map(r => r.tokens)),
    avg_latency:  avg(filerRuns.map(r => r.latency_ms)),
    nodes_loaded: nodes.length,
  };

  const delta     = filerResult.avg_score - baselineResult.avg_score;
  const deltaStr  = delta >= 0
    ? chalk.green(`+${delta} points`)
    : chalk.red(`${delta} points`);

  const baselineViolations = baselineRuns.flatMap(r => r.violations).length;
  const filerViolations    = filerRuns.flatMap(r => r.violations).length;
  const violDelta          = baselineViolations - filerViolations;

  // ── Print results ─────────────────────────────────────────────────────────

  console.log(chalk.bold('\n  Results\n'));
  console.log(
    `  ${'Variant'.padEnd(20)} ${'Avg Score'.padEnd(14)} ${'Violations'.padEnd(14)} ${'Avg Tokens'.padEnd(14)} Avg Latency`
  );
  console.log('  ' + '─'.repeat(72));
  console.log(
    `  ${'Without Filer'.padEnd(20)} ${String(baselineResult.avg_score).padEnd(14)} ${String(baselineViolations).padEnd(14)} ${String(baselineResult.avg_tokens).padEnd(14)} ${Math.round(baselineResult.avg_latency / 1000)}s`
  );
  console.log(
    `  ${'With Filer'.padEnd(20)} ${String(filerResult.avg_score).padEnd(14)} ${String(filerViolations).padEnd(14)} ${String(filerResult.avg_tokens).padEnd(14)} ${Math.round(filerResult.avg_latency / 1000)}s`
  );
  console.log();
  console.log(`  Score delta:       ${deltaStr} (with Filer vs. baseline)`);
  console.log(`  Violations delta:  ${violDelta >= 0 ? chalk.green(`-${violDelta}`) : chalk.red(`+${Math.abs(violDelta)}`)} violations with Filer`);
  console.log(`  Context nodes:     ${nodes.length} loaded (${typeStr})`);
  console.log(`  LLM cost:          ~$${gateway.sessionStats().estimated_usd.toFixed(4)}`);

  if (delta < 0) {
    console.log(chalk.yellow('\n  ⚠ Score decreased with Filer context.'));
    console.log(chalk.dim('  Possible causes:'));
    console.log(chalk.dim('    · Nodes may be too verbose — run filer verify to prune low-quality nodes'));
    console.log(chalk.dim('    · Task may not align well with available nodes'));
    console.log(chalk.dim('    · Try a different --scope or --task that matches your node content'));
  } else if (delta >= 10) {
    console.log(chalk.green('\n  ✓ Meaningful improvement with Filer context.'));
  } else if (delta >= 0) {
    console.log(chalk.dim('\n  Marginal improvement. Consider verifying more nodes for stronger signal.'));
  }

  console.log();
}



