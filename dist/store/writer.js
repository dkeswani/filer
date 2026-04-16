import fs from 'fs';
import path from 'path';
import { AnyNodeSchema, FilerIndexSchema, FilerConfigSchema, FILER_DIR, FILER_INDEX, FILER_CONFIG, FILER_VERSION, NODE_TYPES, } from '../schema/mod.js';
// ── Paths ─────────────────────────────────────────────────────────────────────
export function resolveRoot(cwd = process.cwd()) {
    return cwd;
}
export function filerDir(root) {
    return path.join(root, FILER_DIR);
}
export function nodeFilePath(root, node) {
    return path.join(root, FILER_DIR, node.type, `${nodeSlug(node.id)}.json`);
}
function nodeSlug(id) {
    // 'constraint:no-refresh-in-auth' → 'no-refresh-in-auth'
    return id.split(':')[1] ?? id;
}
// ── Ensure directory structure ────────────────────────────────────────────────
export function ensureFilerDirs(root) {
    const base = filerDir(root);
    fs.mkdirSync(base, { recursive: true });
    for (const type of NODE_TYPES) {
        fs.mkdirSync(path.join(base, type), { recursive: true });
    }
}
// ── Write a single node ───────────────────────────────────────────────────────
export function writeNode(root, node) {
    // Validate before writing
    const parsed = AnyNodeSchema.parse(node);
    const filePath = nodeFilePath(root, parsed);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
}
// ── Write multiple nodes ──────────────────────────────────────────────────────
export function writeNodes(root, nodes) {
    for (const node of nodes) {
        writeNode(root, node);
    }
}
// ── Write index.json ──────────────────────────────────────────────────────────
export function writeIndex(root, index) {
    const parsed = FilerIndexSchema.parse(index);
    const filePath = path.join(root, FILER_INDEX);
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
}
// ── Build index from all nodes on disk ───────────────────────────────────────
export function buildIndex(root, opts) {
    const allNodes = readAllNodes(root);
    const byType = {};
    for (const type of NODE_TYPES)
        byType[type] = 0;
    for (const node of allNodes)
        byType[node.type]++;
    const verifiedCount = allNodes.filter(n => n.verified).length;
    const staleCount = allNodes.filter(n => n.stale_risk > 0.7).length;
    const summaries = allNodes.map(n => ({
        id: n.id,
        type: n.type,
        file: `${n.type}/${nodeSlug(n.id)}.json`,
        scope: n.scope,
        summary: getSummary(n),
        tags: n.tags,
        confidence: n.confidence,
        verified: n.verified,
        stale_risk: n.stale_risk,
        updated_at: n.updated_at,
    }));
    return {
        filer_version: FILER_VERSION,
        repo: opts.repo,
        indexed_at: new Date().toISOString(),
        last_commit: opts.last_commit,
        llm: opts.llm,
        stats: {
            files_indexed: opts.files_indexed,
            nodes_total: allNodes.length,
            by_type: byType,
            coverage_pct: Math.round((opts.files_indexed / Math.max(opts.files_indexed, 1)) * 100),
            verified_pct: allNodes.length > 0
                ? Math.round((verifiedCount / allNodes.length) * 100)
                : 0,
            stale_count: staleCount,
        },
        nodes: summaries,
    };
}
function getSummary(node) {
    switch (node.type) {
        case 'intent': return node.purpose.slice(0, 120);
        case 'constraint': return node.statement.slice(0, 120);
        case 'assumption': return node.statement.slice(0, 120);
        case 'danger': return node.statement.slice(0, 120);
        case 'pattern': return node.statement.slice(0, 120);
        case 'decision': return node.statement.slice(0, 120);
        case 'security': return node.statement.slice(0, 120);
        case 'antipattern': return node.statement.slice(0, 120);
    }
}
// ── Write config ──────────────────────────────────────────────────────────────
export function writeConfig(root, config) {
    const parsed = FilerConfigSchema.parse(config);
    const filePath = path.join(root, FILER_CONFIG);
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
}
// ── Read operations ───────────────────────────────────────────────────────────
export function readNode(root, id) {
    try {
        const [type, slug] = id.split(':');
        const filePath = path.join(root, FILER_DIR, type, `${slug}.json`);
        const raw = fs.readFileSync(filePath, 'utf-8');
        return AnyNodeSchema.parse(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
export function readAllNodes(root) {
    const nodes = [];
    const base = filerDir(root);
    if (!fs.existsSync(base))
        return nodes;
    for (const type of NODE_TYPES) {
        const typeDir = path.join(base, type);
        if (!fs.existsSync(typeDir))
            continue;
        const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(typeDir, file), 'utf-8');
                const node = AnyNodeSchema.parse(JSON.parse(raw));
                nodes.push(node);
            }
            catch (err) {
                // Skip malformed nodes — log but don't throw
                process.stderr.write(`Warning: failed to parse ${type}/${file}: ${err}\n`);
            }
        }
    }
    return nodes;
}
export function readIndex(root) {
    try {
        const filePath = path.join(root, FILER_INDEX);
        const raw = fs.readFileSync(filePath, 'utf-8');
        return FilerIndexSchema.parse(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
export function readConfig(root) {
    try {
        const filePath = path.join(root, FILER_CONFIG);
        const raw = fs.readFileSync(filePath, 'utf-8');
        return FilerConfigSchema.parse(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
export function filerExists(root) {
    return fs.existsSync(path.join(root, FILER_DIR));
}
export function indexExists(root) {
    return fs.existsSync(path.join(root, FILER_INDEX));
}
// ── Scope matching helper ─────────────────────────────────────────────────────
function scopeMatches(nodeScope, filePath) {
    // Normalize: strip trailing slashes and glob wildcards for comparison
    const cleanScope = nodeScope.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
    const cleanFile = filePath.replace(/\/$/, '');
    // File must start with the scope path (exact prefix match)
    return cleanFile.startsWith(cleanScope + '/') || cleanFile === cleanScope;
}
function anyScopeMatches(nodeScopes, filePaths) {
    return nodeScopes.some(s => filePaths.some(f => scopeMatches(s, f)));
}
export function upsertNode(root, incoming) {
    const existing = readNode(root, incoming.id);
    if (!existing) {
        writeNode(root, incoming);
        return { created: true };
    }
    // Merge: increment version, preserve verification, update scores
    const merged = {
        ...existing,
        ...incoming,
        version: existing.version + 1,
        verified: existing.verified, // preserve human verification
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
        stale_risk: 0, // reset stale risk on update
    };
    writeNode(root, merged);
    return { created: false };
}
// ── Mark nodes as potentially stale ──────────────────────────────────────────
export function markStale(root, scope, increment = 0.3) {
    const nodes = readAllNodes(root);
    let count = 0;
    for (const node of nodes) {
        if (node.verified)
            continue; // verified nodes are immune to auto-stale
        if (anyScopeMatches(node.scope, scope)) {
            const updated = {
                ...node,
                stale_risk: Math.min(1, node.stale_risk + increment),
                updated_at: new Date().toISOString(),
            };
            writeNode(root, updated);
            count++;
        }
    }
    return count;
}
// ── Scope-filtered node loading (for agent context) ───────────────────────────
export function loadNodesForScope(root, filePaths) {
    const index = readIndex(root);
    if (!index)
        return [];
    const relevant = index.nodes.filter(summary => anyScopeMatches(summary.scope, filePaths));
    const nodes = [];
    for (const summary of relevant) {
        const node = readNode(root, summary.id);
        if (node)
            nodes.push(node);
    }
    const priority = {
        security: 0, constraint: 1, danger: 2, assumption: 3,
        antipattern: 4, pattern: 5, intent: 6, decision: 7,
    };
    return nodes.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));
}
//# sourceMappingURL=writer.js.map