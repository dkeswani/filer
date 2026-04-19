import chalk from 'chalk';
import {
  filerExists,
  readIndex,
  readConfig,
  loadNodesForScope,
  readAllNodes,
} from '../store/mod.js';
import { LLMGateway } from '../llm/mod.js';
import { AnyNode, NodeType, NODE_PRIORITY } from '../schema/mod.js';

interface QueryOptions {
  scope?:  string;
  type?:   string;
  json?:   boolean;
  noLlm?:  boolean;   // just show relevant nodes, no LLM synthesis
}

const QUERY_SYSTEM = `You are a codebase knowledge assistant for the Filer knowledge layer.

You are given a set of knowledge nodes about a codebase — constraints, patterns, dangers,
security rules, assumptions, antipatterns, decisions, and intents — and a question from a developer.

Answer the question using ONLY the provided nodes. Be specific and concrete.
Cite node IDs when relevant (e.g., "per constraint:no-refresh-in-auth...").
If the nodes do not contain enough information to answer, say so clearly.
Do not invent knowledge not present in the nodes.

Format: plain text, no markdown headers. 2-4 paragraphs maximum.`;

export async function queryCommand(question: string, options: QueryOptions): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
    process.exit(1);
  }

  const index = readIndex(root);
  if (!index || index.stats.nodes_total === 0) {
    console.log(chalk.yellow('\n  No nodes indexed yet. Run: filer index\n'));
    return;
  }

  // ── Find relevant nodes ───────────────────────────────────────────────────

  let nodes: AnyNode[];

  if (options.scope) {
    // Scope-filtered load
    nodes = loadNodesForScope(root, [options.scope]);
  } else {
    // Keyword-based relevance filter against all nodes
    nodes = findRelevantNodes(readAllNodes(root), question);
  }

  // Filter by type if specified
  if (options.type) {
    const types = options.type.split(',').map(t => t.trim()) as NodeType[];
    nodes = nodes.filter(n => types.includes(n.type));
  }

  if (nodes.length === 0) {
    console.log(chalk.yellow('\n  No relevant nodes found for this query.'));
    console.log(chalk.dim('  Try: filer query "..." --scope src/yourmodule/\n'));
    return;
  }

  // ── JSON output mode ──────────────────────────────────────────────────────

  if (options.json) {
    console.log(JSON.stringify(nodes, null, 2));
    return;
  }

  // ── Show nodes without LLM synthesis ─────────────────────────────────────

  if (options.noLlm) {
    console.log(chalk.bold(`\n  Query: ${question}`));
    console.log(chalk.dim(`  Found ${nodes.length} relevant node(s)\n`));
    printNodeSummaries(nodes);
    return;
  }

  // ── LLM-synthesised answer ────────────────────────────────────────────────

  const config = readConfig(root);
  if (!config) {
    console.error(chalk.red('\n  No config found. Run: filer init\n'));
    process.exit(1);
  }

  const nodeContext = serializeNodesForQuery(nodes);

  const prompt = `Question: ${question}

Knowledge nodes (${nodes.length} relevant):

${nodeContext}`;

  process.stdout.write(chalk.bold(`\n  Query: ${question}\n\n`));
  process.stdout.write(chalk.dim(`  Searching ${nodes.length} relevant node(s)...\n\n`));

  const gateway  = new LLMGateway(config);
  const response = await gateway.complete(
    'query.answer',
    [{ role: 'user', content: prompt }],
    { system: QUERY_SYSTEM, max_tokens: 1000 }
  );

  // Print answer with light formatting
  const lines = response.content.trim().split('\n');
  for (const line of lines) {
    if (line.trim() === '') {
      console.log();
    } else {
      // Highlight cited node IDs
      const highlighted = line.replace(
        /([a-z]+:[a-z0-9-]+)/g,
        (match) => chalk.cyan(match)
      );
      console.log('  ' + highlighted);
    }
  }

  console.log();
  console.log(chalk.dim(`  Sources: ${nodes.map(n => n.id).join(', ')}`));
  console.log(chalk.dim(`  Cost: $${gateway.sessionStats().estimated_usd.toFixed(4)}\n`));
}

// ── Relevance scoring ─────────────────────────────────────────────────────────

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
      const count = (text.match(new RegExp(term, 'g')) ?? []).length;
      score += count;
    }

    // Boost high-priority node types
    score += (7 - (NODE_PRIORITY[node.type] ?? 7)) * 0.5;

    // Boost verified nodes
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

// ── Serialise nodes for the LLM prompt ───────────────────────────────────────

function serializeNodesForQuery(nodes: AnyNode[]): string {
  return nodes.map(node => {
    const lines: string[] = [
      `[${node.type.toUpperCase()}] ${node.id}  confidence:${node.confidence}  verified:${node.verified}`,
      `scope: ${node.scope.join(', ')}`,
    ];

    switch (node.type) {
      case 'intent':
        lines.push(`purpose: ${node.purpose}`);
        if (node.does_not_own.length) lines.push(`does_not_own: ${node.does_not_own.join('; ')}`);
        break;
      case 'constraint':
        lines.push(`statement: ${node.statement}`);
        lines.push(`because: ${node.because}`);
        lines.push(`if_violated: ${node.if_violated}`);
        if (node.instead) lines.push(`instead: ${node.instead}`);
        break;
      case 'assumption':
        lines.push(`statement: ${node.statement}`);
        lines.push(`breaks_when: ${node.breaks_when}`);
        if (node.boundary) lines.push(`boundary: ${node.boundary}`);
        break;
      case 'danger':
        lines.push(`statement: ${node.statement}`);
        lines.push(`condition: ${node.condition}`);
        lines.push(`safe_pattern: ${node.safe_pattern}`);
        if (node.current_mitigation) lines.push(`mitigation: ${node.current_mitigation}`);
        break;
      case 'pattern':
        lines.push(`statement: ${node.statement}`);
        lines.push(`why: ${node.why}`);
        if (node.anti_pattern) lines.push(`anti_pattern: ${node.anti_pattern}`);
        break;
      case 'decision':
        lines.push(`statement: ${node.statement}`);
        lines.push(`reason: ${node.reason}`);
        if (node.alternatives_rejected.length) {
          lines.push(`alternatives_rejected: ${node.alternatives_rejected.map(a => `${a.option} — ${a.why_rejected}`).join('; ')}`);
        }
        break;
      case 'security':
        lines.push(`severity: ${node.severity}  category: ${node.category}`);
        lines.push(`statement: ${node.statement}`);
        lines.push(`because: ${node.because}`);
        lines.push(`if_violated: ${node.if_violated}`);
        lines.push(`safe_pattern: ${node.safe_pattern}`);
        break;
      case 'antipattern':
        lines.push(`statement: ${node.statement}`);
        lines.push(`looks_right_because: ${node.why_it_looks_right}`);
        lines.push(`wrong_here_because: ${node.why_its_wrong_here}`);
        lines.push(`correct_pattern: ${node.correct_pattern}`);
        break;
    }

    if (node.must_not.length) lines.push(`must_not: ${node.must_not.join('; ')}`);
    if (node.related.length)  lines.push(`related: ${node.related.join(', ')}`);

    return lines.join('\n');
  }).join('\n\n---\n\n');
}

// ── Compact node summary for --no-llm mode ────────────────────────────────────

function printNodeSummaries(nodes: AnyNode[]): void {
  const typeColors: Record<NodeType, (s: string) => string> = {
    security:    chalk.red,
    constraint:  chalk.yellow,
    danger:      chalk.magenta,
    assumption:  chalk.blue,
    antipattern: chalk.cyan,
    pattern:     chalk.green,
    intent:      chalk.white,
    decision:    chalk.gray,
  };

  for (const node of nodes) {
    const color   = typeColors[node.type] ?? chalk.white;
    const badge   = node.verified ? chalk.green(' ✓') : chalk.dim(' ?');
    console.log(color(`  [${node.type}]`) + ' ' + chalk.bold(node.id) + badge);
    console.log(chalk.dim(`  scope: ${node.scope.join(', ')}`));

    const summary = getSummaryLine(node);
    console.log(`  ${summary}`);
    console.log();
  }
}

function getSummaryLine(node: AnyNode): string {
  switch (node.type) {
    case 'intent':      return node.purpose.slice(0, 100);
    case 'constraint':  return node.statement.slice(0, 100);
    case 'assumption':  return node.statement.slice(0, 100);
    case 'danger':      return node.statement.slice(0, 100);
    case 'pattern':     return node.statement.slice(0, 100);
    case 'decision':    return node.statement.slice(0, 100);
    case 'security':    return `[${node.severity}] ${node.statement.slice(0, 90)}`;
    case 'antipattern': return node.statement.slice(0, 100);
  }
}

// Export for benchmark use
export { serializeNodesForQuery as serializeNodesForBenchmark };
