import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { filerExists, readAllNodes, loadNodesForScope, readConfig } from '../store/mod.js';
import { LLMGateway } from '../llm/mod.js';

interface BenchmarkOptions {
  task?:    string;
  scope?:   string;
  runs?:    string;
  output?:  string;
}

interface TaskResult {
  run:        number;
  with_filer: boolean;
  response:   string;
  score:      number;
  tokens:     number;
  latency_ms: number;
}

interface BenchmarkReport {
  task:             string;
  scope:            string;
  runs_per_variant: number;
  without_filer:    { avg_score: number; avg_tokens: number; avg_latency_ms: number };
  with_filer:       { avg_score: number; avg_tokens: number; avg_latency_ms: number; context_nodes: number };
  delta_score:      number;
  results:          TaskResult[];
}

// ── Built-in benchmark tasks ──────────────────────────────────────────────────

const BUILTIN_TASKS: Record<string, { prompt: string; scope: string }> = {
  'implement-feature': {
    scope: 'src/',
    prompt: 'Implement a new user authentication endpoint. Describe the key considerations and potential pitfalls.',
  },
  'review-code': {
    scope: 'src/',
    prompt: 'Review this code for correctness, security, and adherence to project patterns:\n\nconst token = jwt.sign({ userId, email }, secret, { expiresIn: "30d" });',
  },
  'debug-issue': {
    scope: 'src/',
    prompt: 'A payment occasionally processes twice. What are the most likely causes and how would you fix them?',
  },
};

// ── LLM scoring prompt ────────────────────────────────────────────────────────

function buildScoringPrompt(task: string, response: string, hasContext: boolean): string {
  return `You are evaluating an AI coding assistant's response for quality and codebase-awareness.

Task given to the assistant: "${task}"
The assistant ${hasContext ? 'HAD access to' : 'did NOT have access to'} the codebase knowledge layer.

Response to evaluate:
---
${response}
---

Score the response from 0-100 on:
- Specificity (does it make concrete, actionable points vs generic advice?)
- Risk awareness (does it identify non-obvious failure modes?)
- Constraint awareness (does it mention or respect codebase-specific rules, if known?)

Respond with JSON only: { "score": <number 0-100>, "reasoning": "<one sentence>" }`;
}

// ── Main command ──────────────────────────────────────────────────────────────

export async function benchmarkCommand(options: BenchmarkOptions): Promise<void> {
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

  const taskKey = options.task ?? 'implement-feature';
  const builtin = BUILTIN_TASKS[taskKey];
  if (!builtin) {
    console.error(chalk.red(`\n  Unknown task: ${taskKey}`));
    console.error(chalk.dim(`  Available: ${Object.keys(BUILTIN_TASKS).join(', ')}\n`));
    process.exit(1);
  }

  const scope   = options.scope ?? builtin.scope;
  const runs    = parseInt(options.runs ?? '3', 10);
  const taskPrompt = builtin.prompt;

  const gateway = new LLMGateway(config);

  console.log(chalk.bold('\n  Filer Benchmark\n'));
  console.log(chalk.dim(`  Task:  ${taskKey}`));
  console.log(chalk.dim(`  Scope: ${scope}`));
  console.log(chalk.dim(`  Runs:  ${runs} per variant (${runs * 2} total)\n`));

  const scopeNodes = loadNodesForScope(root, [scope]);
  const contextBlock = scopeNodes.length > 0
    ? `\n\nKnowledge layer context for ${scope}:\n\n` +
      scopeNodes.map(n => {
        const summary = getNodeSummary(n);
        return `[${n.type.toUpperCase()}] ${n.id}\n${summary}`;
      }).join('\n\n')
    : '';

  const results: TaskResult[] = [];

  // ── Without Filer context ──────────────────────────────────────────────────
  console.log(chalk.dim('  Running without Filer context...'));
  for (let i = 0; i < runs; i++) {
    const start = Date.now();
    const res = await gateway.complete('query.answer', [
      { role: 'user', content: taskPrompt },
    ], { max_tokens: 512, temperature: 0.3 });

    // Score the response
    const scoreRes = await gateway.completeJSON<{ score: number; reasoning: string }>(
      'query.answer',
      [{ role: 'user', content: buildScoringPrompt(taskPrompt, res.content, false) }],
      { max_tokens: 128 }
    );

    results.push({
      run: i + 1,
      with_filer: false,
      response: res.content,
      score: scoreRes?.score ?? 50,
      tokens: res.input_tokens + res.output_tokens,
      latency_ms: Date.now() - start,
    });
    process.stdout.write(chalk.dim(`    run ${i + 1}/${runs} score=${scoreRes?.score ?? '?'}\n`));
  }

  // ── With Filer context ─────────────────────────────────────────────────────
  console.log(chalk.dim('\n  Running with Filer context...'));
  for (let i = 0; i < runs; i++) {
    const start = Date.now();
    const res = await gateway.complete('query.answer', [
      { role: 'user', content: taskPrompt + contextBlock },
    ], { max_tokens: 512, temperature: 0.3 });

    const scoreRes = await gateway.completeJSON<{ score: number; reasoning: string }>(
      'query.answer',
      [{ role: 'user', content: buildScoringPrompt(taskPrompt, res.content, true) }],
      { max_tokens: 128 }
    );

    results.push({
      run: i + 1,
      with_filer: true,
      response: res.content,
      score: scoreRes?.score ?? 50,
      tokens: res.input_tokens + res.output_tokens,
      latency_ms: Date.now() - start,
    });
    process.stdout.write(chalk.dim(`    run ${i + 1}/${runs} score=${scoreRes?.score ?? '?'}\n`));
  }

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const withoutResults = results.filter(r => !r.with_filer);
  const withResults    = results.filter(r => r.with_filer);

  const report: BenchmarkReport = {
    task: taskKey,
    scope,
    runs_per_variant: runs,
    without_filer: {
      avg_score:      avg(withoutResults.map(r => r.score)),
      avg_tokens:     avg(withoutResults.map(r => r.tokens)),
      avg_latency_ms: avg(withoutResults.map(r => r.latency_ms)),
    },
    with_filer: {
      avg_score:      avg(withResults.map(r => r.score)),
      avg_tokens:     avg(withResults.map(r => r.tokens)),
      avg_latency_ms: avg(withResults.map(r => r.latency_ms)),
      context_nodes:  scopeNodes.length,
    },
    delta_score: avg(withResults.map(r => r.score)) - avg(withoutResults.map(r => r.score)),
    results,
  };

  // ── Print report ───────────────────────────────────────────────────────────
  console.log(chalk.bold('\n  Results\n'));
  const cols = ['Variant', 'Avg Score', 'Avg Tokens', 'Avg Latency'];
  console.log('  ' + cols.map(c => c.padEnd(16)).join(''));
  console.log('  ' + '-'.repeat(64));

  const woPct = Math.round(report.without_filer.avg_score);
  const wiPct = Math.round(report.with_filer.avg_score);
  console.log('  ' + [
    'Without Filer'.padEnd(16),
    `${woPct}`.padEnd(16),
    `${Math.round(report.without_filer.avg_tokens)}`.padEnd(16),
    `${Math.round(report.without_filer.avg_latency_ms)}ms`,
  ].join(''));
  console.log('  ' + [
    'With Filer'.padEnd(16),
    `${wiPct}`.padEnd(16),
    `${Math.round(report.with_filer.avg_tokens)}`.padEnd(16),
    `${Math.round(report.with_filer.avg_latency_ms)}ms`,
  ].join(''));

  const delta = report.delta_score;
  const deltaStr = delta > 0
    ? chalk.green(`+${delta.toFixed(1)} points`)
    : delta < 0 ? chalk.red(`${delta.toFixed(1)} points`)
    : chalk.dim('no change');

  console.log(`\n  Score delta: ${deltaStr} (with vs. without Filer context)`);
  console.log(chalk.dim(`  Context nodes loaded: ${scopeNodes.length}`));

  if (options.output) {
    const outPath = path.resolve(options.output);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    console.log(chalk.dim(`\n  Report saved: ${outPath}`));
  }

  console.log();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

function getNodeSummary(node: { type: string; [k: string]: unknown }): string {
  switch (node.type) {
    case 'constraint':  return (node as any).statement;
    case 'danger':      return (node as any).statement;
    case 'assumption':  return (node as any).statement;
    case 'pattern':     return (node as any).statement;
    case 'intent':      return (node as any).purpose;
    case 'decision':    return (node as any).statement;
    case 'security':    return (node as any).statement;
    case 'antipattern': return (node as any).statement;
    default:            return '';
  }
}
