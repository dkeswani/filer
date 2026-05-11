import chalk from 'chalk';
import fs    from 'fs';
import path  from 'path';
import { buildGraph }         from '../graph/builder.js';
import { renderGraphSummary } from '../graph/summary.js';
import { renderGraphHtml }    from '../graph/viewer.js';
import { resolveRoot }        from '../store/writer.js';

export interface GraphOptions {
  root?:        string;   // explicit repo root (defaults to process.cwd())
  open?:        boolean;
  incremental?: boolean;
  maxNodes?:    string;
}

export async function graphCommand(options: GraphOptions): Promise<void> {
  const root = options.root ? resolveRoot(options.root) : resolveRoot();

  console.log(chalk.cyan('\n  Building knowledge graph…\n'));

  const graph = await buildGraph({
    repoRoot:    root,
    incremental: options.incremental !== false,
    quiet:       false,
  });

  // Write GRAPH.md
  const mdPath = path.join(root, '.filer', 'GRAPH.md');
  fs.writeFileSync(mdPath, renderGraphSummary(graph));

  // Write graph.html
  const maxNodes = options.maxNodes ? parseInt(options.maxNodes, 10) : 500;
  const htmlPath = path.join(root, '.filer', 'graph.html');
  fs.writeFileSync(htmlPath, renderGraphHtml(graph, { maxNodes }));

  const s = graph.stats;
  console.log(chalk.green('  ✓ graph.json written'));
  console.log(chalk.green('  ✓ GRAPH.md written'));
  console.log(chalk.green('  ✓ graph.html written'));
  console.log();
  console.log(chalk.dim(`  Structural nodes : ${s.structural_nodes}`));
  console.log(chalk.dim(`  Semantic nodes   : ${s.semantic_nodes}`));
  console.log(chalk.dim(`  Governs edges    : ${s.governs_edges}`));
  console.log(chalk.dim(`  Files parsed     : ${s.files_parsed}`));
  console.log();

  if (options.open) {
    const { default: open } = await import('open').catch(() => ({ default: null })) as { default: ((p: string) => void) | null };
    if (open) {
      open(htmlPath);
      console.log(chalk.cyan(`  Opened ${htmlPath}`));
    } else {
      console.log(chalk.dim(`  View: ${htmlPath}`));
    }
  } else {
    console.log(chalk.dim(`  View: .filer/graph.html`));
  }

  console.log();
}
