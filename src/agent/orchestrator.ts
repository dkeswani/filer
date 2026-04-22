// Phase 1 agent: deterministic event-driven orchestrator
// Maps event types to command sequences — no LLM reasoning

import chalk from 'chalk';
import type { AgentEventContext } from './events.js';
import {
  toolGetRepoState,
  toolRunUpdate,
  toolRunLearn,
  toolRunScan,
  toolPostSummary,
  type ToolResult,
} from './tools.js';

export interface OrchestratorResult {
  event:   string;
  steps:   ToolResult[];
  success: boolean;
  summary: string;
}

export async function runOrchestrator(
  root: string,
  ctx:  AgentEventContext,
): Promise<OrchestratorResult> {
  const steps: ToolResult[] = [];

  const run = async (fn: () => Promise<ToolResult>) => {
    const r = await fn();
    steps.push(r);
    if (!ctx.dryRun) {
      const icon = r.success ? chalk.green('✓') : chalk.red('✗');
      process.stderr.write(`  ${icon} ${r.tool}: ${r.summary}\n`);
    }
    return r;
  };

  switch (ctx.event) {
    case 'commit': {
      // commit pushed → update nodes for changed files
      await run(() => toolRunUpdate(root, { checkStale: false, dryRun: ctx.dryRun }));
      break;
    }

    case 'pr_merged': {
      // PR merged → mine review comments for new knowledge nodes
      await run(() => toolRunLearn(root, {
        prNumber:  ctx.prNumber,
        autoApply: ctx.autoApply,
        dryRun:    ctx.dryRun,
      }));
      break;
    }

    case 'ci': {
      // CI run → security scan, fail on high severity
      await run(() => toolRunScan(root, {
        ci:      true,
        failOn:  ctx.failOn ?? 'high',
        fast:    false,
        dryRun:  ctx.dryRun,
      }));
      break;
    }

    case 'scheduled': {
      // Nightly: staleness check + surface unverified nodes
      await run(() => toolGetRepoState(root));
      await run(() => toolRunUpdate(root, { checkStale: true, dryRun: ctx.dryRun }));
      break;
    }
  }

  const failed  = steps.filter(s => !s.success);
  const success = failed.length === 0;
  const summary = success
    ? `${steps.length} step(s) completed successfully`
    : `${failed.length} step(s) failed: ${failed.map(s => s.tool).join(', ')}`;

  if (!ctx.dryRun) {
    const logText = [
      `## Agent run: ${ctx.event}`,
      `Steps: ${steps.length} · Status: ${success ? 'OK' : 'FAILED'}`,
      steps.map(s => `- ${s.success ? '✓' : '✗'} **${s.tool}**: ${s.summary}`).join('\n'),
    ].join('\n\n');
    await toolPostSummary(root, logText);
  }

  return { event: ctx.event, steps, success, summary };
}
