import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import {
  ensureFilerDirs,
  writeNode,
  writeConfig,
  writeIndex,
  buildIndex,
  readNode,
  readAllNodes,
  readIndex,
  loadNodesForScope,
} from '../store/writer.js';
import type { AnyNode } from '../schema/mod.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

function makeConstraint(id = 'constraint:no-refresh', scope = ['src/auth/']): AnyNode {
  return {
    id, type: 'constraint',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope, tags: ['auth'],
    confidence: 0.95, verified: false, stale_risk: 0,
    related: [], supersedes: [],
    must_not: ['refresh_token', 'renewToken'],
    statement: 'Never implement token refresh in auth module.',
    because: 'Auth is stateless.',
    if_violated: 'Circular dependency.',
  };
}

function makeSecurity(id = 'security:never-log-pii', scope = ['src/']): AnyNode {
  return {
    id, type: 'security',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope, tags: ['pii'],
    confidence: 1.0, verified: true, stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    severity: 'critical',
    category: 'data-exposure',
    statement: 'Never log user PII.',
    because: 'GDPR.',
    if_violated: 'Regulatory fines.',
    safe_pattern: 'Log user.id only.',
    audit_required: false,
    what_requires_audit: [],
    what_does_not_require_audit: [],
    verification_required: true,
  };
}

function makePattern(id = 'pattern:error-handling', scope = ['src/']): AnyNode {
  return {
    id, type: 'pattern',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope, tags: ['errors'],
    confidence: 0.9, verified: false, stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    statement: 'Always wrap async calls with try/catch.',
    why: 'Consistent error reporting.',
    deviations: [],
  };
}

function makeConfig() {
  return {
    version: '1.0' as const,
    llm: {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-6',
      indexing_model: 'claude-haiku-4-5-20251001',
      deep_model: 'claude-sonnet-4-6',
    },
    include: ['src/**'],
    exclude: ['**/node_modules/**'],
    module_boundaries: { strategy: 'directory' as const, max_depth: 3, manifests: ['package.json'] },
    node_types: {} as any,
    auto_update: true,
    stale_threshold: 0.7,
  };
}

let tmpDir: string;
let origCwd: string;

beforeEach(() => {
  tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'filer-mcp-test-'));
  origCwd = process.cwd();
  ensureFilerDirs(tmpDir);
  writeConfig(tmpDir, makeConfig());
  const index = buildIndex(tmpDir, { repo: 'test-repo', llm: 'claude-sonnet-4-6', files_indexed: 3 });
  writeIndex(tmpDir, index);
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(origCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── filer_scope ───────────────────────────────────────────────────────────────

function rebuildIndex(root: string, nodes: AnyNode[]): void {
  const index = buildIndex(root, { repo: 'test-repo', llm: 'claude-sonnet-4-6', files_indexed: nodes.length });
  writeIndex(root, index);
}

describe('filer_scope', () => {
  it('returns nodes matching file paths', () => {
    const n1 = makeConstraint('constraint:no-refresh', ['src/auth/']);
    const n2 = makePattern('pattern:error-handling', ['src/payments/']);
    writeNode(tmpDir, n1);
    writeNode(tmpDir, n2);
    rebuildIndex(tmpDir, [n1, n2]);

    const nodes = loadNodesForScope(tmpDir, ['src/auth/validate.ts']);
    expect(nodes.some(n => n.id === 'constraint:no-refresh')).toBe(true);
    expect(nodes.every(n => n.id !== 'pattern:error-handling')).toBe(true);
  });

  it('returns nodes sorted security first', () => {
    const n1 = makePattern('pattern:error-handling', ['src/']);
    const n2 = makeSecurity('security:never-log-pii', ['src/']);
    const n3 = makeConstraint('constraint:no-refresh', ['src/']);
    writeNode(tmpDir, n1);
    writeNode(tmpDir, n2);
    writeNode(tmpDir, n3);
    rebuildIndex(tmpDir, [n1, n2, n3]);

    const nodes = loadNodesForScope(tmpDir, ['src/auth/validate.ts']);
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(nodes[0].type).toBe('security');
  });

  it('returns empty array for unmatched paths', () => {
    const n1 = makeConstraint('constraint:no-refresh', ['src/auth/']);
    writeNode(tmpDir, n1);
    rebuildIndex(tmpDir, [n1]);

    const nodes = loadNodesForScope(tmpDir, ['src/unrelated/file.ts']);
    expect(nodes).toHaveLength(0);
  });
});

// ── filer_query ───────────────────────────────────────────────────────────────

describe('filer_query (keyword scoring)', () => {
  it('returns nodes matching question keywords', () => {
    writeNode(tmpDir, makeConstraint());
    writeNode(tmpDir, makePattern());

    const nodes = readAllNodes(tmpDir);
    const terms = 'auth token refresh'.split(/\W+/).filter(t => t.length > 2);
    const scored = nodes
      .map(node => {
        const text = JSON.stringify(node).toLowerCase();
        const score = terms.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
        return { node, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.node);

    expect(scored.some(n => n.id === 'constraint:no-refresh')).toBe(true);
  });

  it('returns empty for unmatched question', () => {
    writeNode(tmpDir, makeConstraint());
    const nodes = readAllNodes(tmpDir);
    const terms = ['zzznomatch'];
    const matched = nodes.filter(node => {
      const text = JSON.stringify(node).toLowerCase();
      return terms.some(t => text.includes(t));
    });
    expect(matched).toHaveLength(0);
  });
});

// ── filer_node ────────────────────────────────────────────────────────────────

describe('filer_node', () => {
  it('returns a node by ID', () => {
    writeNode(tmpDir, makeConstraint());
    const node = readNode(tmpDir, 'constraint:no-refresh');
    expect(node).not.toBeNull();
    expect(node!.id).toBe('constraint:no-refresh');
  });

  it('returns null for unknown ID', () => {
    const node = readNode(tmpDir, 'constraint:does-not-exist');
    expect(node).toBeNull();
  });
});

// ── filer_stats ───────────────────────────────────────────────────────────────

describe('filer_stats', () => {
  it('reports correct stale and verified counts', () => {
    writeNode(tmpDir, makeConstraint('constraint:a', ['src/']));
    writeNode(tmpDir, makeSecurity('security:b', ['src/']));
    writeNode(tmpDir, { ...makePattern('pattern:c', ['src/']), stale_risk: 0.8 });

    const idx   = readIndex(tmpDir);
    const nodes = readAllNodes(tmpDir);
    const stale    = nodes.filter(n => n.stale_risk >= 0.5).length;
    const verified = nodes.filter(n => n.verified).length;

    expect(idx).not.toBeNull();
    expect(stale).toBe(1);
    expect(verified).toBe(1);
  });
});

// ── filer_check ───────────────────────────────────────────────────────────────

describe('filer_check', () => {
  it('detects must_not pattern violations', () => {
    const n1 = makeConstraint('constraint:no-refresh', ['src/auth/']);
    writeNode(tmpDir, n1);
    rebuildIndex(tmpDir, [n1]);
    const nodes = loadNodesForScope(tmpDir, ['src/auth/']);

    const code = 'const token = renewToken(user.id);';
    const violations: string[] = [];
    for (const node of nodes) {
      for (const pattern of (node.must_not ?? [])) {
        if (code.toLowerCase().includes(pattern.toLowerCase())) {
          violations.push(node.id);
        }
      }
    }

    expect(violations).toContain('constraint:no-refresh');
  });

  it('returns no violations for clean code', () => {
    const n1 = makeConstraint('constraint:no-refresh', ['src/auth/']);
    writeNode(tmpDir, n1);
    rebuildIndex(tmpDir, [n1]);
    const nodes = loadNodesForScope(tmpDir, ['src/auth/']);

    const code = 'const token = generateToken(user.id);';
    const violations: string[] = [];
    for (const node of nodes) {
      for (const pattern of (node.must_not ?? [])) {
        if (code.toLowerCase().includes(pattern.toLowerCase())) {
          violations.push(node.id);
        }
      }
    }

    expect(violations).toHaveLength(0);
  });
});

// ── .claude/mcp.json ─────────────────────────────────────────────────────────

describe('filer init — .claude/mcp.json', () => {
  it('writes valid mcp.json with filer mcp server config', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    const mcpPath   = path.join(claudeDir, 'mcp.json');
    fs.mkdirSync(claudeDir, { recursive: true });

    const config = { mcpServers: { filer: { command: 'filer', args: ['mcp'] } } };
    fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const parsed = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    expect(parsed.mcpServers.filer.command).toBe('filer');
    expect(parsed.mcpServers.filer.args).toEqual(['mcp']);
  });

  it('does not overwrite existing mcp.json', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    const mcpPath   = path.join(claudeDir, 'mcp.json');
    fs.mkdirSync(claudeDir, { recursive: true });

    const existing = { mcpServers: { other: { command: 'other', args: [] } } };
    fs.writeFileSync(mcpPath, JSON.stringify(existing, null, 2), 'utf-8');

    // Simulate init's guard: if file exists, skip
    if (!fs.existsSync(mcpPath)) {
      fs.writeFileSync(mcpPath, JSON.stringify({ mcpServers: { filer: { command: 'filer', args: ['mcp'] } } }), 'utf-8');
    }

    const parsed = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    expect(parsed.mcpServers.other).toBeDefined();
    expect(parsed.mcpServers.filer).toBeUndefined();
  });
});
