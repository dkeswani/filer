import { readIndex, readConfig, loadNodesForScope, readAllNodes } from '../store/mod.js';
import { LLMGateway } from '../llm/mod.js';
import { AnyNode, NodeType, NODE_PRIORITY } from '../schema/mod.js';
import { filterNodes } from '../commands/utils.js';

export interface QueryOptions {
  scope?:  string;
  type?:   string;
  apiKey?: string;
  model?:  string;
}

export interface QueryResult {
  answer:    string;
  nodes:     AnyNode[];
  nodeCount: number;
  costUsd:   number;
}

const QUERY_SYSTEM = `You are a codebase knowledge assistant for the Filer knowledge layer.

You are given a set of knowledge nodes about a codebase — constraints, patterns, dangers,
security rules, assumptions, antipatterns, decisions, and intents — and a question from a developer.

Answer the question using ONLY the provided nodes. Be specific and concrete.
Cite node IDs when relevant (e.g., "per constraint:no-refresh-in-auth...").
If the nodes do not contain enough information to answer, say so clearly.
Do not invent knowledge not present in the nodes.

Format: plain text, no markdown headers. 2-4 paragraphs maximum.`;

export async function queryNodes(root: string, question: string, options: QueryOptions = {}): Promise<QueryResult> {
  const index = readIndex(root);
  if (!index || index.stats.nodes_total === 0) {
    return { answer: 'No nodes indexed in this repository.', nodes: [], nodeCount: 0, costUsd: 0 };
  }

  let nodes: AnyNode[];
  if (options.scope) {
    nodes = loadNodesForScope(root, [options.scope]);
  } else {
    nodes = findRelevantNodes(readAllNodes(root), question);
  }

  if (options.type) nodes = filterNodes(nodes, { type: options.type });

  if (nodes.length === 0) {
    return { answer: 'No relevant nodes found for this query.', nodes: [], nodeCount: 0, costUsd: 0 };
  }

  const config = readConfig(root);
  if (!config) throw new Error('No filer config found — run filer init first.');

  const effectiveConfig = options.apiKey
    ? { ...config, api_key: options.apiKey, ...(options.model ? { model: options.model } : {}) }
    : config;

  const gateway = new LLMGateway(effectiveConfig as any);
  const nodeContext = serializeNodesForQuery(nodes);
  const prompt = `Question: ${question}\n\nKnowledge nodes (${nodes.length} relevant):\n\n${nodeContext}`;

  const response = await gateway.complete(
    'query.answer',
    [{ role: 'user', content: prompt }],
    { system: QUERY_SYSTEM, max_tokens: 1000 }
  );

  return {
    answer:    response.content.trim(),
    nodes,
    nodeCount: nodes.length,
    costUsd:   gateway.sessionStats().estimated_usd,
  };
}

function findRelevantNodes(nodes: AnyNode[], question: string): AnyNode[] {
  const terms = question.toLowerCase()
    .replace(/[?.,!]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 3)
    .filter(t => !STOP_WORDS.has(t));

  if (terms.length === 0) return nodes.slice(0, 15);

  const scored = nodes.map(node => {
    const text = nodeToText(node).toLowerCase();
    let score  = 0;
    for (const term of terms) {
      score += (text.match(new RegExp(term, 'g')) ?? []).length;
    }
    score += (7 - (NODE_PRIORITY[node.type] ?? 7)) * 0.5;
    if (node.verified) score += 1;
    return { node, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(s => s.node);
}

function nodeToText(node: AnyNode): string {
  const parts: string[] = [node.id, ...node.tags, ...node.scope, ...node.must_not];
  switch (node.type) {
    case 'intent':      parts.push(node.purpose, ...node.owns, ...node.does_not_own); break;
    case 'constraint':  parts.push(node.statement, node.because, node.if_violated, node.instead ?? ''); break;
    case 'assumption':  parts.push(node.statement, node.breaks_when, node.boundary ?? ''); break;
    case 'danger':      parts.push(node.statement, node.condition, node.safe_pattern, node.history ?? ''); break;
    case 'pattern':     parts.push(node.statement, node.why, node.anti_pattern ?? ''); break;
    case 'decision':    parts.push(node.statement, node.reason); break;
    case 'security':    parts.push(node.statement, node.because, node.if_violated, node.category, node.severity); break;
    case 'antipattern': parts.push(node.statement, node.why_it_looks_right, node.why_its_wrong_here, node.correct_pattern); break;
  }
  return parts.join(' ');
}

const STOP_WORDS = new Set(['what', 'when', 'where', 'which', 'that', 'this', 'with', 'from', 'have', 'does', 'should', 'would', 'could', 'about', 'there', 'their', 'they', 'been', 'will', 'more', 'also']);

function serializeNodesForQuery(nodes: AnyNode[]): string {
  return nodes.map(node => {
    const lines: string[] = [
      `[${node.type.toUpperCase()}] ${node.id}  confidence:${node.confidence}  verified:${node.verified}`,
      `scope: ${node.scope.join(', ')}`,
    ];
    switch (node.type) {
      case 'intent':      lines.push(`purpose: ${node.purpose}`); break;
      case 'constraint':  lines.push(`statement: ${node.statement}`, `because: ${node.because}`, `if_violated: ${node.if_violated}`); break;
      case 'assumption':  lines.push(`statement: ${node.statement}`, `breaks_when: ${node.breaks_when}`); break;
      case 'danger':      lines.push(`statement: ${node.statement}`, `condition: ${node.condition}`, `safe_pattern: ${node.safe_pattern}`); break;
      case 'pattern':     lines.push(`statement: ${node.statement}`, `why: ${node.why}`); break;
      case 'decision':    lines.push(`statement: ${node.statement}`, `reason: ${node.reason}`); break;
      case 'security':    lines.push(`severity: ${node.severity}  category: ${node.category}`, `statement: ${node.statement}`, `because: ${node.because}`, `if_violated: ${node.if_violated}`); break;
      case 'antipattern': lines.push(`statement: ${node.statement}`, `correct_pattern: ${node.correct_pattern}`); break;
    }
    return lines.join('\n');
  }).join('\n\n---\n\n');
}
