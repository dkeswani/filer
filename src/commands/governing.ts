import chalk from 'chalk';
import fs    from 'fs';
import path  from 'path';
import { resolveRoot } from '../store/writer.js';
import { FILER_GRAPH } from '../schema/mod.js';
import type { GraphOutput, ASTNode, GovernsEdge } from '../graph/types.js';
import type { AnyNode } from '../schema/nodes.js';

export interface GoverningOptions {
  type?: string;
}

export async function governingCommand(target: string, options: GoverningOptions): Promise<void> {
  const root      = resolveRoot();
  const graphPath = path.join(root, FILER_GRAPH);

  if (!fs.existsSync(graphPath)) {
    console.error(chalk.red('\n  No graph.json found. Run `filer graph` first.\n'));
    process.exit(1);
  }

  const graph: GraphOutput = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const allNodes = graph.nodes as Array<ASTNode | AnyNode>;

  // Resolve target AST node
  const astNode = allNodes.find(n => n.id === target || n.id.includes(target) ||
    ('name' in n && (n as ASTNode).name === target && n.id.startsWith('ast:'))) as ASTNode | undefined;

  if (!astNode) {
    console.error(chalk.red(`\n  AST node not found: ${target}\n`));
    process.exit(1);
  }

  const nodeById = new Map(allNodes.map(n => [n.id, n]));
  const governsEdges = (graph.edges as Array<GovernsEdge | { relation: string }>)
    .filter((e): e is GovernsEdge => e.relation === 'governs' && (e as GovernsEdge).target === astNode.id);

  if (governsEdges.length === 0) {
    console.log(chalk.dim(`\n  No semantic nodes govern ${astNode.id}\n`));
    return;
  }

  console.log(chalk.cyan(`\n  Semantic nodes governing ${chalk.bold(astNode.name ?? astNode.id)}\n`));

  for (const edge of governsEdges) {
    const sem = nodeById.get(edge.source) as AnyNode | undefined;
    if (!sem) continue;
    if (options.type && sem.type !== options.type) continue;

    const typeColor: Record<string, chalk.Chalk> = {
      security:    chalk.red,
      constraint:  chalk.yellow,
      danger:      chalk.yellow,
      assumption:  chalk.magenta,
      antipattern: chalk.red,
      pattern:     chalk.blue,
      intent:      chalk.cyan,
      decision:    chalk.green,
    };
    const colorFn = typeColor[sem.type] ?? chalk.white;

    console.log(`  ${colorFn(sem.type.padEnd(12))} ${chalk.bold(sem.id)}`);
    if ('statement' in sem) console.log(chalk.dim(`               ${(sem as { statement: string }).statement.slice(0, 80)}`));
    if ('purpose'   in sem) console.log(chalk.dim(`               ${(sem as { purpose: string }).purpose.slice(0, 80)}`));
    if ('severity'  in sem) console.log(chalk.dim(`               severity: ${(sem as { severity: string }).severity}`));
    console.log();
  }
}
