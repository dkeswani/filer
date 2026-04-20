import fs from 'fs';
import path from 'path';
import {
  AnyNode,
  AnyNodeSchema,
  FilerIndex,
  FilerIndexSchema,
  FilerConfig,
  FilerConfigSchema,
  NodeSummary,
  FILER_DIR,
  FILER_INDEX,
  FILER_CONFIG,
  FILER_VERSION,
  NODE_TYPES,
} from '../schema/mod.js';

// ── Paths ─────────────────────────────────────────────────────────────────────

export function resolveRoot(cwd: string = process.cwd()): string {
  return cwd;
}

export function filerDir(root: string): string {
  return path.join(root, FILER_DIR);
}

export function nodeFilePath(root: string, node: AnyNode): string {
  return path.join(root, FILER_DIR, node.type, `${nodeSlug(node.id)}.json`);
}

function nodeSlug(id: string): string {
  // 'constraint:no-refresh-in-auth' → 'no-refresh-in-auth'
  return id.split(':')[1] ?? id;
}

// ── Ensure directory structure ────────────────────────────────────────────────

export function ensureFilerDirs(root: string): void {
  const base = filerDir(root);
  fs.mkdirSync(base, { recursive: true });
  for (const type of NODE_TYPES) {
    fs.mkdirSync(path.join(base, type), { recursive: true });
  }
}

// ── Write a single node ───────────────────────────────────────────────────────

export function writeNode(root: string, node: AnyNode): void {
  // Validate before writing
  const parsed = AnyNodeSchema.parse(node);
  const filePath = nodeFilePath(root, parsed);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
}

// ── Write multiple nodes ──────────────────────────────────────────────────────

export function writeNodes(root: string, nodes: AnyNode[]): void {
  for (const node of nodes) {
    writeNode(root, node);
  }
}

// ── Write index.json ──────────────────────────────────────────────────────────

export function writeIndex(root: string, index: FilerIndex): void {
  const parsed = FilerIndexSchema.parse(index);
  const filePath = path.join(root, FILER_INDEX);
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
}

// ── Build index from all nodes on disk ───────────────────────────────────────

export function buildIndex(root: string, opts: {
  repo: string;
  llm: string;
  last_commit?: string;
  files_indexed: number;
}): FilerIndex {
  const allNodes = readAllNodes(root);

  const byType: Record<string, number> = {};
  for (const type of NODE_TYPES) byType[type] = 0;
  for (const node of allNodes) byType[node.type]++;

  const verifiedCount = allNodes.filter(n => n.verified).length;
  const staleCount = allNodes.filter(n => n.stale_risk > 0.7).length;

  const summaries: NodeSummary[] = allNodes.map(n => ({
    id:         n.id,
    type:       n.type,
    file:       `${n.type}/${nodeSlug(n.id)}.json`,
    scope:      n.scope,
    summary:    getSummary(n),
    tags:       n.tags,
    confidence: n.confidence,
    verified:   n.verified,
    stale_risk: n.stale_risk,
    updated_at: n.updated_at,
  }));

  return {
    filer_version: FILER_VERSION,
    repo:          opts.repo,
    indexed_at:    new Date().toISOString(),
    last_commit:   opts.last_commit,
    llm:           opts.llm,
    stats: {
      files_indexed: opts.files_indexed,
      nodes_total:   allNodes.length,
      by_type:       byType,
      coverage_pct:  Math.round((opts.files_indexed / Math.max(opts.files_indexed, 1)) * 100),
      verified_pct:  allNodes.length > 0
        ? Math.round((verifiedCount / allNodes.length) * 100)
        : 0,
      stale_count:   staleCount,
    },
    nodes: summaries,
  };
}

function getSummary(node: AnyNode): string {
  switch (node.type) {
    case 'intent':      return node.purpose.slice(0, 120);
    case 'constraint':  return node.statement.slice(0, 120);
    case 'assumption':  return node.statement.slice(0, 120);
    case 'danger':      return node.statement.slice(0, 120);
    case 'pattern':     return node.statement.slice(0, 120);
    case 'decision':    return node.statement.slice(0, 120);
    case 'security':    return node.statement.slice(0, 120);
    case 'antipattern': return node.statement.slice(0, 120);
  }
}

// ── Write config ──────────────────────────────────────────────────────────────

export function writeConfig(root: string, config: FilerConfig): void {
  const parsed = FilerConfigSchema.parse(config);
  const filePath = path.join(root, FILER_CONFIG);
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
}

// ── Read operations ───────────────────────────────────────────────────────────

export function readNode(root: string, id: string): AnyNode | null {
  try {
    const [type, slug] = id.split(':');
    const filePath = path.join(root, FILER_DIR, type, `${slug}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return AnyNodeSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function readAllNodes(root: string): AnyNode[] {
  const nodes: AnyNode[] = [];
  const base = filerDir(root);
  if (!fs.existsSync(base)) return nodes;

  for (const type of NODE_TYPES) {
    const typeDir = path.join(base, type);
    if (!fs.existsSync(typeDir)) continue;
    const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(typeDir, file), 'utf-8');
        const node = AnyNodeSchema.parse(JSON.parse(raw));
        nodes.push(node);
      } catch (err) {
        // Skip malformed nodes — log but don't throw
        process.stderr.write(`Warning: failed to parse ${type}/${file}: ${err}\n`);
      }
    }
  }
  return nodes;
}

export function readIndex(root: string): FilerIndex | null {
  try {
    const filePath = path.join(root, FILER_INDEX);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return FilerIndexSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function readConfig(root: string): FilerConfig | null {
  try {
    const filePath = path.join(root, FILER_CONFIG);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return FilerConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function filerExists(root: string): boolean {
  return fs.existsSync(path.join(root, FILER_DIR));
}

export function indexExists(root: string): boolean {
  return fs.existsSync(path.join(root, FILER_INDEX));
}

// ── Scope matching helper ─────────────────────────────────────────────────────

function scopeMatches(nodeScope: string, filePath: string): boolean {
  // Normalize: strip trailing slashes and glob wildcards for comparison
  const cleanScope = nodeScope.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
  const cleanFile  = filePath.replace(/\/$/, '');
  // Bidirectional prefix match:
  // - query file is under node scope dir (e.g. node=frontend/src, query=frontend/src/app/page.tsx)
  // - node scope is under query dir (e.g. node=frontend/src/app/page.tsx, query=frontend/src)
  return cleanFile.startsWith(cleanScope + '/')
    || cleanFile === cleanScope
    || cleanScope.startsWith(cleanFile + '/')
    || cleanScope === cleanFile;
}

function anyScopeMatches(nodeScopes: string[], filePaths: string[]): boolean {
  return nodeScopes.some(s => filePaths.some(f => scopeMatches(s, f)));
}

export function upsertNode(root: string, incoming: AnyNode): { created: boolean } {
  const existing = readNode(root, incoming.id);

  if (!existing) {
    writeNode(root, incoming);
    return { created: true };
  }

  // Merge: increment version, preserve verification, update scores
  const merged: AnyNode = {
    ...existing,
    ...incoming,
    version:    existing.version + 1,
    verified:   existing.verified,  // preserve human verification
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
    stale_risk: 0,  // reset stale risk on update
  } as AnyNode;

  writeNode(root, merged);
  return { created: false };
}

// ── Mark nodes as potentially stale ──────────────────────────────────────────

export function markStale(root: string, scope: string[], increment = 0.3): number {
  const nodes = readAllNodes(root);
  let count = 0;

  for (const node of nodes) {
    if (node.verified) continue; // verified nodes are immune to auto-stale

    if (anyScopeMatches(node.scope, scope)) {
      const updated = {
        ...node,
        stale_risk: Math.min(1, node.stale_risk + increment),
        updated_at: new Date().toISOString(),
      } as AnyNode;
      writeNode(root, updated);
      count++;
    }
  }

  return count;
}

// ── Scope-filtered node loading (for agent context) ───────────────────────────

export function loadNodesForScope(root: string, filePaths: string[]): AnyNode[] {
  const index = readIndex(root);
  if (!index) return [];

  const relevant = index.nodes.filter(summary =>
    anyScopeMatches(summary.scope, filePaths)
  );

  const nodes: AnyNode[] = [];
  for (const summary of relevant) {
    const node = readNode(root, summary.id);
    if (node) nodes.push(node);
  }

  const priority: Record<string, number> = {
    security: 0, constraint: 1, danger: 2, assumption: 3,
    antipattern: 4, pattern: 5, intent: 6, decision: 7,
  };

  return nodes.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));
}
