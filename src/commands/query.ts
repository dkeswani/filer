import chalk from 'chalk';
import {
  readAllNodes,
  readConfig,
  filerExists,
} from '../store/mod.js';
import { AnyNode, NODE_PRIORITY } from '../schema/mod.js';
import { LLMGateway } from '../llm/mod.js';

interface QueryOptions {
  type?:   string;
  scope?:  string;
  json?:   boolean;
  noLlm?:  boolean;
}

export async function queryCommand(question: string, options: QueryOptions): Promise<void> {
  const root = process.cwd();

  if (!filerExists(root)) {
    console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
    process.exit(1);
  }

  let nodes = readAllNodes(root);

  if (options.type) {
    const types = options.type.split(',').map(t => t.trim());
    nodes = nodes.filter(n => types.includes(n.type));
  }

  if (options.scope) {
    const scope = options.scope;
    nodes = nodes.filter(n =>
      n.scope.some(s => s.includes(scope) || scope.includes(s.replace('/**', '').replace('/*', '')))
    );
  }

  if (nodes.length === 0) {
    console.log(chalk.yellow('\n  No nodes found. Run: filer index\n'));
    return;
  }

  // Keyword relevance scoring
  const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const scored = nodes
    .map(n => ({ node: n, score: scoreNode(n, keywords) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (NODE_PRIORITY[a.node.type] ?? 9) - (NODE_PRIORITY[b.node.type] ?? 9))
    .slice(0, 10);

  if (scored.length === 0) {
    console.log(chalk.yellow('\n  No relevant nodes found for that question.\n'));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(scored.map(x => x.node), null, 2));
    return;
  }

  console.log(chalk.bold(`\n  Query: `) + chalk.cyan(`"${question}"`));
  console.log(chalk.dim(`  Found ${scored.length} relevant node(s)\n`));

  // LLM-synthesised answer
  if (!options.noLlm) {
    const config = readConfig(root);
    if (config) {
      try {
        const gateway = new LLMGateway(config);
        const nodeContext = scored
          .map(x => nodeToText(x.node))
          .join('\n\n');

        const response = await gateway.complete(
          'query.answer',
          [{ role: 'user', content: `Question: ${question}\n\nRelevant knowledge nodes:\n\n${nodeContext}\n\nAnswer the question concisely, citing specific node IDs where relevant.` }],
          { max_tokens: 512 }
        );

        console.log(chalk.bold('  Answer:\n'));
        const lines = response.content.split('\n');
        for (const line of lines) {
          console.log('  ' + line);
        }
        console.log();
      } catch {
        // fall through to listing nodes
      }
    }
  }

  console.log(chalk.bold('  Relevant nodes:\n'));
  for (const { node, score } of scored) {
    const typeColor = getTypeColor(node.type);
    const summary   = getNodeSummary(node);
    console.log(
      typeColor(`  [${node.type.toUpperCase()}] `) +
      chalk.bold(node.id) +
      chalk.dim(` (score: ${score})`)
    );
    console.log(chalk.dim('    ') + summary);
    console.log();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreNode(node: AnyNode, keywords: string[]): number {
  const text = [
    node.id,
    node.type,
    ...node.scope,
    ...node.tags,
    getNodeSummary(node),
  ].join(' ').toLowerCase();

  return keywords.reduce((sum, kw) => sum + (text.includes(kw) ? 1 : 0), 0);
}

function getNodeSummary(node: AnyNode): string {
  switch (node.type) {
    case 'constraint':  return node.statement;
    case 'danger':      return node.statement;
    case 'assumption':  return node.statement;
    case 'pattern':     return node.statement;
    case 'intent':      return node.purpose;
    case 'decision':    return node.statement;
    case 'security':    return node.statement;
    case 'antipattern': return node.statement;
  }
}

function nodeToText(node: AnyNode): string {
  const summary = getNodeSummary(node);
  return `[${node.type}] ${node.id}\nScope: ${node.scope.join(', ')}\n${summary}`;
}

function getTypeColor(type: string): (s: string) => string {
  const colors: Record<string, (s: string) => string> = {
    security:    chalk.red,
    constraint:  chalk.yellow,
    danger:      chalk.magenta,
    assumption:  chalk.blue,
    antipattern: chalk.cyan,
    pattern:     chalk.green,
    intent:      chalk.white,
    decision:    chalk.gray,
  };
  return colors[type] ?? chalk.white;
}
