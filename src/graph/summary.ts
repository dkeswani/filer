import type { GraphOutput } from './types.js';

/** Renders a human-readable GRAPH.md from a GraphOutput. */
export function renderGraphSummary(graph: GraphOutput): string {
  const s = graph.stats;
  const langLines = Object.entries(s.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `  - ${lang}: ${count} files`)
    .join('\n');

  const topFiles = (graph.nodes as Array<{ kind?: string; source_file?: string; id: string }>)
    .filter(n => n.kind === 'file')
    .slice(0, 20)
    .map(n => `  - ${n.source_file ?? n.id}`)
    .join('\n');

  return `# Filer Knowledge Graph

Generated: ${graph.indexed_at}
Repo: ${graph.origin_repo}
Filer version: ${graph.filer_version}  Graph schema: ${graph.graph_version}

## Stats

| Metric | Value |
|---|---|
| Structural nodes (AST) | ${s.structural_nodes} |
| Structural edges | ${s.structural_edges} |
| Semantic nodes | ${s.semantic_nodes} |
| Governs edges | ${s.governs_edges} |
| Inter-typed edges | ${s.inter_typed_edges} |
| Files parsed | ${s.files_parsed} |
| Files skipped | ${s.files_skipped} |

## Languages

${langLines || '  (none)'}

## Parsed files (first 20)

${topFiles || '  (none)'}

---
_View the interactive graph: \`.filer/graph.html\`_
`;
}
