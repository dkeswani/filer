// Agent tool wrappers — thin adapters over existing Filer commands
// Returns structured results, never writes to stdout

import { runUpdate }                   from '../pipeline/indexer.js';
import { learnCommand }                from '../commands/learn.js';
import { scanCommand }                 from '../commands/scan.js';
import { checkStaleness }              from '../pipeline/staleness.js';
import { readIndex, readAllNodes, readConfig } from '../store/mod.js';
import { LLMGateway }                  from '../llm/mod.js';
import { appendToAgentLog }            from './log.js';

export interface ToolResult {
  tool:    string;
  success: boolean;
  summary: string;
  details?: unknown;
}

// ── Tool implementations ───────────────────────────────────────────────────────

export async function toolGetRepoState(root: string): Promise<ToolResult> {
  const index = readIndex(root);
  if (!index) return { tool: 'get_repo_state', success: false, summary: 'No index found' };

  const nodes    = readAllNodes(root);
  const stale    = nodes.filter(n => n.stale_risk >= 0.5).length;
  const unverified = nodes.filter(n => !n.verified).length;
  const unverifiedSecurity = nodes.filter(n => n.type === 'security' && !n.verified).length;

  const details = {
    repo:         index.repo,
    indexed_at:   index.indexed_at,
    last_commit:  index.last_commit,
    total_nodes:  index.stats?.nodes_total ?? nodes.length,
    stale_nodes:  stale,
    unverified_nodes: unverified,
    unverified_security: unverifiedSecurity,
  };

  return {
    tool: 'get_repo_state',
    success: true,
    summary: `${details.total_nodes} nodes · ${stale} stale · ${unverified} unverified`,
    details,
  };
}

export async function toolRunUpdate(
  root: string, opts: { checkStale?: boolean; dryRun?: boolean }
): Promise<ToolResult> {
  try {
    if (opts.dryRun) {
      return { tool: 'run_update', success: true, summary: `[dry-run] Would run: filer update${opts.checkStale ? ' --check-stale' : ''}` };
    }
    await runUpdate(root, { checkStale: opts.checkStale });
    return { tool: 'run_update', success: true, summary: 'Update complete' };
  } catch (err) {
    return { tool: 'run_update', success: false, summary: String(err) };
  }
}

export async function toolRunStalenessCheck(root: string): Promise<ToolResult> {
  try {
    const config = readConfig(root);
    if (!config) return { tool: 'run_staleness_check', success: false, summary: 'No config found' };
    const gateway = new LLMGateway(config);
    const nodes   = readAllNodes(root);
    const result  = await checkStaleness(gateway, root, nodes);
    return {
      tool: 'run_staleness_check',
      success: true,
      summary: `Checked ${result.checked} nodes · ${result.invalidated} invalidated`,
      details: result,
    };
  } catch (err) {
    return { tool: 'run_staleness_check', success: false, summary: String(err) };
  }
}

export async function toolRunLearn(
  root: string, opts: { prNumber?: number; autoApply?: boolean; dryRun?: boolean }
): Promise<ToolResult> {
  try {
    // Redirect console.log during learn to capture output
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
    try {
      await learnCommand({
        pr:        opts.prNumber ? String(opts.prNumber) : undefined,
        autoApply: opts.autoApply,
        dryRun:    opts.dryRun,
      });
    } finally {
      console.log = orig;
    }
    return { tool: 'run_learn', success: true, summary: 'Learn complete', details: lines };
  } catch (err) {
    return { tool: 'run_learn', success: false, summary: String(err) };
  }
}

export async function toolRunScan(
  root: string, opts: { ci?: boolean; failOn?: string; fast?: boolean; dryRun?: boolean }
): Promise<ToolResult> {
  try {
    if (opts.dryRun) {
      return { tool: 'run_scan', success: true, summary: '[dry-run] Would run: filer scan --ci' };
    }
    await scanCommand({
      output:  `${root}/.filer/report.html`,
      ci:      opts.ci ?? true,
      failOn:  (opts.failOn ?? 'high') as any,
      fast:    opts.fast,
      open:    false,
    });
    return { tool: 'run_scan', success: true, summary: 'Scan complete' };
  } catch (err) {
    const msg = String(err);
    return { tool: 'run_scan', success: false, summary: msg };
  }
}

export async function toolPostSummary(root: string, text: string): Promise<ToolResult> {
  try {
    await appendToAgentLog(root, text);
    return { tool: 'post_summary', success: true, summary: 'Logged' };
  } catch (err) {
    return { tool: 'post_summary', success: false, summary: String(err) };
  }
}
