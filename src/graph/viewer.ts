import type { GraphOutput, ASTNode } from './types.js';
import type { AnyNode } from '../schema/nodes.js';

// Node colours by type/kind
const KIND_COLOR: Record<string, string> = {
  // Semantic
  security:    '#ef4444',
  constraint:  '#f97316',
  danger:      '#eab308',
  assumption:  '#a855f7',
  antipattern: '#ec4899',
  pattern:     '#3b82f6',
  intent:      '#06b6d4',
  decision:    '#10b981',
  // AST
  file:        '#6b7280',
  function:    '#60a5fa',
  method:      '#93c5fd',
  class:       '#34d399',
  interface:   '#a78bfa',
  module:      '#9ca3af',
  export:      '#fbbf24',
};

export interface ViewerNode {
  id:    string;
  label: string;
  kind:  string;
  color: string;
}

export interface ViewerEdge {
  source: string;
  target: string;
  type:   string;
}

export interface ViewerData {
  nodes: ViewerNode[];
  edges: ViewerEdge[];
}

export function buildViewerData(graph: GraphOutput, opts: { maxNodes?: number } = {}): ViewerData {
  const maxNodes = opts.maxNodes ?? 2000;

  // Semantic nodes first (higher priority), then AST nodes up to limit
  const semNodes = (graph.nodes as Array<AnyNode>).filter((n): n is AnyNode =>
    'type' in n && typeof (n as AnyNode).type === 'string' &&
    !((n as AnyNode).id.startsWith('ast:'))
  );

  const astNodes = (graph.nodes as Array<ASTNode>).filter((n): n is ASTNode =>
    n.id.startsWith('ast:')
  );

  const allNodes = [...semNodes, ...astNodes].slice(0, maxNodes);
  const nodeIds  = new Set(allNodes.map(n => n.id));

  const viewerNodes: ViewerNode[] = allNodes.map(n => {
    const kind  = ('kind' in n ? (n as ASTNode).kind : (n as AnyNode).type) ?? 'unknown';
    const label = ('name' in n && (n as ASTNode).name) ? (n as ASTNode).name
                : (n as AnyNode).id.split(':').slice(1).join(':');
    return { id: n.id, label, kind, color: KIND_COLOR[kind] ?? '#9ca3af' };
  });

  const viewerEdges: ViewerEdge[] = (graph.edges as Array<{ source: string; target: string; relation?: string }>)
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(e => ({ source: e.source, target: e.target, type: e.relation ?? '' }));

  return { nodes: viewerNodes, edges: viewerEdges };
}

export function renderGraphHtml(graph: GraphOutput, opts: { maxNodes?: number } = {}): string {
  const data = buildViewerData(graph, opts);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Filer Graph — ${graph.origin_repo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; overflow: hidden; }
  #canvas { width: 100vw; height: 100vh; }
  #info {
    position: fixed; top: 12px; left: 12px;
    background: rgba(15,23,42,.9); border: 1px solid #334155;
    border-radius: 8px; padding: 12px 16px; font-size: 12px; line-height: 1.6;
    max-width: 260px;
  }
  #info h1 { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #38bdf8; }
  #tooltip {
    position: fixed; pointer-events: none; display: none;
    background: rgba(15,23,42,.95); border: 1px solid #475569;
    border-radius: 6px; padding: 8px 12px; font-size: 12px;
    max-width: 320px; line-height: 1.5;
  }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
</style>
</head>
<body>
<svg id="canvas"></svg>
<div id="info">
  <h1>Filer Knowledge Graph</h1>
  <div>${graph.origin_repo}</div>
  <div style="margin-top:4px;color:#94a3b8;font-size:11px">
    ${data.nodes.length} nodes · ${data.edges.length} edges
  </div>
  <div style="margin-top:8px;font-size:11px;color:#64748b">Scroll to zoom · Drag to pan · Click node for details</div>
</div>
<div id="tooltip"></div>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
const DATA = ${JSON.stringify(data)};

const canvas = d3.select('#canvas')
  .attr('width', window.innerWidth).attr('height', window.innerHeight);

const g = canvas.append('g');

canvas.call(d3.zoom().scaleExtent([0.05, 4]).on('zoom', e => g.attr('transform', e.transform)));

// Build lookup
const nodeById = new Map(DATA.nodes.map(n => [n.id, n]));

const sim = d3.forceSimulation(DATA.nodes)
  .force('link',   d3.forceLink(DATA.edges).id(d => d.id).distance(60).strength(0.3))
  .force('charge', d3.forceManyBody().strength(-120))
  .force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
  .force('collide', d3.forceCollide(14));

const link = g.append('g').attr('stroke', '#334155').attr('stroke-opacity', 0.5)
  .selectAll('line').data(DATA.edges).join('line')
  .attr('stroke-width', d => d.type === 'governs' ? 1.5 : 0.8)
  .attr('stroke', d => d.type === 'governs' ? '#f97316' : d.type === 'contains' ? '#475569' : '#334155');

const node = g.append('g')
  .selectAll('circle').data(DATA.nodes).join('circle')
  .attr('r',    d => d.kind === 'file' ? 7 : d.kind.length < 8 ? 10 : 7)
  .attr('fill', d => d.color)
  .attr('stroke', '#0f172a').attr('stroke-width', 1.5)
  .call(d3.drag()
    .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

const label = g.append('g').selectAll('text').data(DATA.nodes.filter(d =>
  ['security','constraint','danger','intent','class','function'].includes(d.kind)
)).join('text')
  .attr('dy', '0.31em').attr('x', 10).attr('font-size', 9).attr('fill', '#94a3b8').text(d => d.label.slice(0, 30));

const tooltip = document.getElementById('tooltip');
node.on('mouseover', (e, d) => {
  tooltip.style.display = 'block';
  tooltip.innerHTML = '<b>' + d.kind.toUpperCase() + '</b> <span style="color:#94a3b8">' + d.id + '</span><br>' + d.label;
}).on('mousemove', e => {
  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top  = (e.clientY - 10) + 'px';
}).on('mouseout', () => { tooltip.style.display = 'none'; });

sim.on('tick', () => {
  link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  node.attr('cx', d => d.x).attr('cy', d => d.y);
  label.attr('x', d => d.x + 10).attr('y', d => d.y);
});

window.addEventListener('resize', () => {
  canvas.attr('width', window.innerWidth).attr('height', window.innerHeight);
  sim.force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2)).alpha(0.1).restart();
});
</script>
</body>
</html>`;
}
