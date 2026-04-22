import { execSync } from 'child_process';
import type { AnyNode } from '../schema/mod.js';
import type { LLMGateway } from '../llm/mod.js';
import { writeNode } from '../store/mod.js';

// ── Git diff for a node's scope since a given date ────────────────────────────

function getDiffSince(root: string, scope: string[], since: string): string {
  // Convert ISO date to a git date filter
  const sinceArg = `--since="${since}"`;

  // Get commits that touch any file in scope since the node was last updated
  const scopePaths = scope.map(s =>
    s.replace(/\/\*\*$/, '').replace(/\/\*$/, '')
  );

  try {
    // Get the unified diff of changes to scope files since updated_at
    const pathArgs = scopePaths.join(' ');
    const diff = execSync(
      `git log ${sinceArg} --oneline --no-merges -- ${pathArgs}`,
      { cwd: root, stdio: 'pipe', maxBuffer: 1024 * 1024 }
    ).toString().trim();

    if (!diff) return '';

    // Get actual diff content (cap at 8000 chars to stay within token budget)
    const diffContent = execSync(
      `git diff HEAD~10..HEAD -- ${pathArgs}`,
      { cwd: root, stdio: 'pipe', maxBuffer: 2 * 1024 * 1024 }
    ).toString().trim().slice(0, 8000);

    return diffContent;
  } catch {
    return '';
  }
}

// ── Serialize node content for the prompt ────────────────────────────────────

function nodeToText(node: AnyNode): string {
  const base = [
    `ID: ${node.id}`,
    `Type: ${node.type}`,
    `Scope: ${node.scope.join(', ')}`,
  ];

  switch (node.type) {
    case 'constraint':
    case 'security':
      base.push(`Statement: ${node.statement}`, `If violated: ${node.if_violated}`);
      break;
    case 'danger':
      base.push(`Statement: ${node.statement}`, `Condition: ${node.condition}`);
      break;
    case 'assumption':
      base.push(`Statement: ${node.statement}`, `Breaks when: ${node.breaks_when}`);
      break;
    case 'antipattern':
      base.push(`Statement: ${node.statement}`, `Correct pattern: ${node.correct_pattern}`);
      break;
    case 'pattern':
      base.push(`Statement: ${node.statement}`, `Why: ${node.why}`);
      break;
    case 'intent':
      base.push(`Purpose: ${node.purpose}`);
      break;
    case 'decision':
      base.push(`Statement: ${node.statement}`, `Reason: ${node.reason}`);
      break;
  }

  return base.join('\n');
}

// ── LLM staleness check for a single node ────────────────────────────────────

export interface StalenessCheckResult {
  node_id:     string;
  invalidated: boolean;
  confidence:  number;
  reason:      string;
}

export async function checkNodeStaleness(
  gateway:  LLMGateway,
  root:     string,
  node:     AnyNode,
): Promise<StalenessCheckResult> {
  const diff = getDiffSince(root, node.scope, node.updated_at);

  if (!diff) {
    return { node_id: node.id, invalidated: false, confidence: 0.9, reason: 'No changes to scope since node was last updated.' };
  }

  const nodeText = nodeToText(node);

  const prompt = `You are checking whether a knowledge node about a codebase is still accurate after recent code changes.

## Knowledge Node
${nodeText}

## Recent Changes to This Scope (git diff)
\`\`\`diff
${diff}
\`\`\`

## Task
Does the diff above invalidate or require updating this knowledge node?

Respond with JSON only:
{
  "invalidated": true | false,
  "confidence": 0.0–1.0,
  "reason": "one sentence explanation"
}

Guidelines:
- invalidated=true only if the diff directly contradicts or removes the thing the node describes
- invalidated=false if the diff is unrelated, additive, or does not affect the node's claim
- A refactor that preserves behavior should NOT invalidate the node
- confidence reflects how certain you are given the available diff`;

  interface CheckResponse {
    invalidated: boolean;
    confidence:  number;
    reason:      string;
  }

  try {
    const result = await gateway.completeJSON<CheckResponse>(
      'verify.check',
      [{ role: 'user', content: prompt }],
      { max_tokens: 256 }
    );

    return {
      node_id:     node.id,
      invalidated: result.invalidated ?? false,
      confidence:  result.confidence ?? 0.5,
      reason:      result.reason ?? '',
    };
  } catch {
    return { node_id: node.id, invalidated: false, confidence: 0.5, reason: 'Check failed — treating as not invalidated.' };
  }
}

// ── Batch staleness check ─────────────────────────────────────────────────────

export interface BatchStalenessResult {
  checked:     number;
  invalidated: number;
  cost_usd:    number;
  results:     StalenessCheckResult[];
}

export async function checkStaleness(
  gateway:   LLMGateway,
  root:      string,
  nodes:     AnyNode[],
  opts:      { threshold?: number; silent?: boolean } = {}
): Promise<BatchStalenessResult> {
  const threshold = opts.threshold ?? 0.5;
  const candidates = nodes.filter(n => n.stale_risk >= threshold && !n.verified);

  if (candidates.length === 0) {
    return { checked: 0, invalidated: 0, cost_usd: 0, results: [] };
  }

  if (!opts.silent) {
    process.stdout.write(`  LLM staleness check: ${candidates.length} node(s) above ${Math.round(threshold * 100)}% risk...\n`);
  }

  const results: StalenessCheckResult[] = [];
  let invalidated = 0;

  for (const node of candidates) {
    const result = await checkNodeStaleness(gateway, root, node);
    results.push(result);

    if (result.invalidated && result.confidence >= 0.7) {
      writeNode(root, {
        ...node,
        stale_risk: 1.0,
        verified:   false,
        updated_at: new Date().toISOString(),
      } as AnyNode);
      invalidated++;

      if (!opts.silent) {
        process.stdout.write(`  ⚠  ${node.id} — invalidated (${Math.round(result.confidence * 100)}% conf): ${result.reason}\n`);
      }
    } else {
      // LLM says it's fine — lower the stale risk
      writeNode(root, {
        ...node,
        stale_risk: Math.max(0, node.stale_risk - 0.2),
        updated_at: new Date().toISOString(),
      } as AnyNode);
    }
  }

  const stats = gateway.sessionStats();

  return {
    checked:     candidates.length,
    invalidated,
    cost_usd:    stats.estimated_usd,
    results,
  };
}
