import fs   from 'fs';
import path from 'path';
import { readAllNodes, readConfig, filerExists, resolveRoot } from '../store/writer.js';
import { resolveOriginRepo, FILER_GRAPH, FILER_GRAPH_VERSION, FilerConfigSchema } from '../schema/mod.js';
import { extractAST }   from './extractor.js';
import { attachGoverns } from './attachment.js';
import type { GraphOutput, TypedEdge } from './types.js';

export interface BuildGraphOptions {
  repoRoot?:   string;
  incremental?: boolean;
  quiet?:       boolean;
}

export async function buildGraph(opts: BuildGraphOptions = {}): Promise<GraphOutput> {
  const repoRoot = opts.repoRoot ?? resolveRoot();

  if (!filerExists(repoRoot)) {
    throw new Error(`No .filer/ directory found. Run 'filer init' first.`);
  }

  const config      = readConfig(repoRoot) ?? FilerConfigSchema.parse({ llm: { provider: 'anthropic' } });
  const semanticNodes = readAllNodes(repoRoot);

  if (!opts.quiet) process.stderr.write('  Extracting AST…\n');
  const astGraph = await extractAST(repoRoot, config, { incremental: opts.incremental ?? true });

  if (!opts.quiet) process.stderr.write('  Attaching semantic nodes…\n');
  const { edges: governsEdges, stats: attachStats } = attachGoverns(semanticNodes, astGraph);

  // ── Inter-typed edges from node relations ─────────────────────────────────
  const typedEdges: TypedEdge[] = [];
  for (const node of semanticNodes) {
    for (const rel of node.related ?? []) {
      typedEdges.push({ source: node.id, target: rel, relation: 'RELATED' });
    }
    for (const sup of node.supersedes ?? []) {
      typedEdges.push({ source: node.id, target: sup, relation: 'SUPERSEDES' });
    }
    for (const mn of node.must_not ?? []) {
      typedEdges.push({ source: node.id, target: mn, relation: 'MUST_NOT_MODIFY_WITH' });
    }
  }

  // ── Language stats ────────────────────────────────────────────────────────
  const languages: Record<string, number> = {};
  for (const n of astGraph.nodes) {
    if (n.kind === 'file') {
      languages[n.language] = (languages[n.language] ?? 0) + 1;
    }
  }

  const output: GraphOutput = {
    filer_version:  getPackageVersion(repoRoot),
    graph_version:  FILER_GRAPH_VERSION,
    indexed_at:     new Date().toISOString(),
    origin_repo:    resolveOriginRepo(repoRoot),
    stats: {
      structural_nodes:  astGraph.nodes.length,
      structural_edges:  astGraph.edges.length,
      semantic_nodes:    attachStats.semantic_nodes,
      governs_edges:     attachStats.governs_edges,
      inter_typed_edges: typedEdges.length,
      files_parsed:      astGraph.stats.files_parsed,
      files_skipped:     astGraph.stats.files_skipped,
      languages,
    },
    nodes: [...astGraph.nodes, ...semanticNodes],
    edges: [...astGraph.edges, ...governsEdges, ...typedEdges],
  };

  const outPath = path.join(repoRoot, FILER_GRAPH);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  return output;
}

function getPackageVersion(repoRoot: string): string {
  // Walk up from repo root to find filer's own package.json
  try {
    const pkg = JSON.parse(fs.readFileSync(
      path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../package.json'),
      'utf8'
    ));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
