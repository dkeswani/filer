// Filer Agent — Phase 2: ReAct reasoning loop
// observe → reason → act → reflect, using LLMGateway for decisions

import chalk from 'chalk';
import { readConfig, readAllNodes, readIndex } from '../store/mod.js';
import { LLMGateway }   from '../llm/mod.js';
import { appendToAgentLog } from './log.js';
import { AGENT_SYSTEM_PROMPT, CONFIDENCE_THRESHOLD, MAX_ITERATIONS } from './prompt.js';
import {
  toolGetRepoState,
  toolRunUpdate,
  toolRunStalenessCheck,
  toolRunLearn,
  toolRunScan,
  toolPostSummary,
  type ToolResult,
} from './tools.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentAction {
  tool:       string;
  args:       Record<string, unknown>;
  reasoning:  string;
  confidence: number;
}

interface HistoryEntry {
  role:    'user' | 'assistant';
  content: string;
}

export interface LoopResult {
  iterations: number;
  steps:      ToolResult[];
  success:    boolean;
  summary:    string;
}

// ── Observation builder ───────────────────────────────────────────────────────

async function buildObservation(root: string, steps: ToolResult[]): Promise<string> {
  const index = readIndex(root);
  const nodes = readAllNodes(root);
  const stale = nodes.filter(n => n.stale_risk >= 0.5).length;
  const unverified = nodes.filter(n => !n.verified).length;
  const unverifiedSecurity = nodes.filter(n => n.type === 'security' && !n.verified).length;

  const repoState = {
    repo:         index?.repo ?? 'unknown',
    indexed_at:   index?.indexed_at ?? 'never',
    last_commit:  index?.last_commit ?? 'unknown',
    total_nodes:  nodes.length,
    stale_nodes:  stale,
    unverified_nodes: unverified,
    unverified_security: unverifiedSecurity,
  };

  const previousSteps = steps.length > 0
    ? `\n\nPrevious actions this session:\n${steps.map(s =>
        `- ${s.tool}: ${s.success ? '✓' : '✗'} ${s.summary}`
      ).join('\n')}`
    : '';

  return `Repository state:\n${JSON.stringify(repoState, null, 2)}${previousSteps}\n\nWhat should the agent do next?`;
}

// ── Tool dispatcher ───────────────────────────────────────────────────────────

async function dispatch(
  root:    string,
  action:  AgentAction,
  dryRun:  boolean,
): Promise<ToolResult> {
  const args = action.args as any;

  if (dryRun) {
    return {
      tool:    action.tool,
      success: true,
      summary: `[dry-run] Would call ${action.tool}(${JSON.stringify(args)})`,
    };
  }

  switch (action.tool) {
    case 'get_repo_state':
      return toolGetRepoState(root);

    case 'run_update':
      return toolRunUpdate(root, { checkStale: args.checkStale });

    case 'run_staleness_check':
      return toolRunStalenessCheck(root);

    case 'run_learn':
      return toolRunLearn(root, {
        prNumber:  args.prNumber,
        autoApply: action.confidence >= CONFIDENCE_THRESHOLD && !args.securityOnly,
      });

    case 'run_scan':
      return toolRunScan(root, { ci: false, failOn: args.failOn ?? 'high' });

    case 'queue_for_review':
      return {
        tool:    'queue_for_review',
        success: true,
        summary: `Queued ${(args.nodeIds as string[])?.length ?? 0} node(s) for review: ${args.reason}`,
        details: args,
      };

    case 'post_summary':
      return toolPostSummary(root, args.text ?? '');

    case 'done':
      return { tool: 'done', success: true, summary: 'Agent loop complete' };

    default:
      return { tool: action.tool, success: false, summary: `Unknown tool: ${action.tool}` };
  }
}

// ── ReAct loop ────────────────────────────────────────────────────────────────

export async function runReActLoop(
  root:   string,
  opts:   { dryRun?: boolean; quiet?: boolean } = {},
): Promise<LoopResult> {
  const config = readConfig(root);
  if (!config) throw new Error('No .filer-config.json found. Run: filer init');

  const gateway  = new LLMGateway(config);
  const history:  HistoryEntry[] = [];
  const steps:    ToolResult[]   = [];
  const log = opts.quiet ? () => {} : (msg: string) => process.stderr.write(msg + '\n');

  if (opts.dryRun) log(chalk.dim('\n  [dry-run] ReAct loop — no changes will be made\n'));
  else             log(chalk.bold('\n  filer agent — ReAct reasoning loop\n'));

  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    // ── Observe ──────────────────────────────────────────────────────────────
    const observation = await buildObservation(root, steps);
    history.push({ role: 'user', content: observation });

    // ── Reason ───────────────────────────────────────────────────────────────
    let action: AgentAction;
    try {
      action = await gateway.completeJSON<AgentAction>(
        'agent.reason',
        history,
        { system: AGENT_SYSTEM_PROMPT, max_tokens: 512 },
      );
    } catch (err) {
      log(chalk.red(`  ✗ Reasoning failed: ${err instanceof Error ? err.message : String(err)}`));
      break;
    }

    // Validate required fields
    if (!action.tool) {
      log(chalk.yellow('  ⚠ Agent returned no tool — stopping'));
      break;
    }

    log(chalk.dim(`  [${iteration}/${MAX_ITERATIONS}] ${chalk.cyan(action.tool)} — ${action.reasoning} (confidence: ${action.confidence?.toFixed(2) ?? '?'})`));

    // Add reasoning to history
    history.push({ role: 'assistant', content: JSON.stringify(action) });

    // ── Act ───────────────────────────────────────────────────────────────────
    const result = await dispatch(root, action, opts.dryRun ?? false);
    steps.push(result);

    const icon = result.success ? chalk.green('✓') : chalk.red('✗');
    log(`  ${icon} ${result.summary}`);

    // ── Reflect: terminate conditions ─────────────────────────────────────────
    if (action.tool === 'done') break;
    if (!result.success) {
      log(chalk.yellow(`  ⚠ Tool failed — stopping loop`));
      break;
    }
  }

  // Write final audit entry if we ran anything meaningful
  const meaningful = steps.filter(s => s.tool !== 'get_repo_state' && s.tool !== 'done');
  if (!opts.dryRun && meaningful.length > 0) {
    const logText = [
      `## ReAct agent run (${new Date().toISOString().slice(0, 10)})`,
      `Iterations: ${iteration} · Steps: ${steps.length}`,
      steps.map(s => `- ${s.success ? '✓' : '✗'} **${s.tool}**: ${s.summary}`).join('\n'),
    ].join('\n\n');
    await appendToAgentLog(root, logText);
  }

  const failed  = steps.filter(s => !s.success);
  const success = failed.length === 0;
  const summary = success
    ? `${iteration} iteration(s), ${meaningful.length} action(s) taken`
    : `${failed.length} failure(s): ${failed.map(s => s.tool).join(', ')}`;

  log(success ? chalk.green(`\n  ✓ ${summary}\n`) : chalk.red(`\n  ✗ ${summary}\n`));

  return { iterations: iteration, steps, success, summary };
}
