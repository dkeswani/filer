import chalk from 'chalk';
import fs    from 'fs';
import path  from 'path';
import { resolveRoot } from '../store/writer.js';
import { FILER_GRAPH } from '../schema/mod.js';
import type { GraphOutput, ASTNode } from '../graph/types.js';
import type { AnyNode } from '../schema/nodes.js';

export interface ExplainOptions {
  depth?: string;
}

export async function explainCommand(target: string, options: ExplainOptions): Promise<void> {
  const root      = resolveRoot();
  const graphPath = path.join(root, FILER_GRAPH);

  if (!fs.existsSync(graphPath)) {
    console.error(chalk.red('\n  No graph.json found. Run `filer graph` first.\n'));
    process.exit(1);
  }

  const graph: GraphOutput = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const depth = parseInt(options.depth ?? '1', 10);

  // Find node by id or by name (partial match)
  const allNodes = graph.nodes as Array<ASTNode | AnyNode>;
  const found = allNodes.find(n => n.id === target)
    ?? allNodes.find(n => n.id.includes(target))
    ?? allNodes.find(n => ('name' in n && (n as ASTNode).name === target));

  if (!found) {
    console.error(chalk.red(`\n  Node not found: ${target}\n`));
    console.log(chalk.dim('  Try: filer explain <id-or-name>'));
    console.log(chalk.dim('  IDs look like: ast:src/auth/validate.ts:5:validateJWT'));
    process.exit(1);
  }

  console.log();
  printNode(found);

  // Walk outbound edges up to depth
  const edges = graph.edges as Array<{ source: string; target: string; relation?: string }>;
  const nodeById = new Map(allNodes.map(n => [n.id, n]));

  let frontier = new Set([found.id]);
  const visited = new Set([found.id]);

  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const e of edges) {
      if (frontier.has(e.source) && !visited.has(e.target)) {
        const targetNode = nodeById.get(e.target);
        if (targetNode) {
          console.log(chalk.dim(`\n  ${'  '.repeat(d)}─[${e.relation ?? '→'}]→`));
          printNode(targetNode);
          next.add(e.target);
          visited.add(e.target);
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  console.log();
}

function printNode(node: ASTNode | AnyNode): void {
  const isAST = node.id.startsWith('ast:');
  if (isAST) {
    const n = node as ASTNode;
    console.log(chalk.bold(`  ${n.kind.toUpperCase()}`) + chalk.dim(` ${n.id}`));
    console.log(`    name:    ${n.name}`);
    console.log(`    file:    ${n.source_file}:${n.line}`);
    console.log(`    lang:    ${n.language}`);
    console.log(`    exported: ${n.exported}`);
  } else {
    const n = node as AnyNode;
    console.log(chalk.bold(`  ${n.type.toUpperCase()}`) + chalk.dim(` ${n.id}`));
    if ('statement' in n)     console.log(`    statement: ${(n as { statement: string }).statement}`);
    if ('purpose' in n)       console.log(`    purpose:   ${(n as { purpose: string }).purpose}`);
    if ('severity' in n)      console.log(`    severity:  ${(n as { severity: string }).severity}`);
  }
}
