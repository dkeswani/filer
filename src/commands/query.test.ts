import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import {
  ensureFilerDirs,
  writeNode,
  writeConfig,
  writeIndex,
  buildIndex,
} from '../store/writer.js';
import type { AnyNode } from '../schema/mod.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

function makeConstraint(id = 'constraint:no-refresh'): AnyNode {
  return {
    id, type: 'constraint',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope: ['src/auth/'],
    tags: ['auth'],
    confidence: 0.95,
    verified: false,
    stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    statement: 'Never implement token refresh in auth module.',
    because: 'Auth is stateless by design.',
    if_violated: 'Circular dependency and session corruption.',
  };
}

function makePattern(id = 'pattern:error-handling'): AnyNode {
  return {
    id, type: 'pattern',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope: ['src/'],
    tags: ['errors'],
    confidence: 0.90,
    verified: true,
    stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    statement: 'Always wrap async calls with try/catch and re-throw as AppError.',
    why: 'Consistent error reporting to the client.',
    deviations: [],
  };
}

function makeSecurity(id = 'security:never-log-pii'): AnyNode {
  return {
    id, type: 'security',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope: ['src/'],
    tags: ['pii'],
    confidence: 1.0,
    verified: true,
    stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    severity: 'critical',
    category: 'data-exposure',
    statement: 'Never log user PII fields.',
    because: 'GDPR compliance.',
    if_violated: 'Regulatory fines and data breach liability.',
    safe_pattern: 'Log user.id only.',
    audit_required: false,
    what_requires_audit: [],
    what_does_not_require_audit: [],
    verification_required: true,
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
    module_boundaries: {
      strategy: 'directory' as const,
      max_depth: 3,
      manifests: ['package.json'],
    },
    node_types: {} as any,
    auto_update: true,
    stale_threshold: 0.7,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filer-query-test-'));
  ensureFilerDirs(tmpDir);
  writeConfig(tmpDir, makeConfig());
  const index = buildIndex(tmpDir, { repo: 'test-repo', llm: 'claude-sonnet-4-6', files_indexed: 3 });
  writeIndex(tmpDir, index);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('queryCommand — keyword scoring', () => {
  it('finds nodes matching keywords in the question', async () => {
    writeNode(tmpDir, makeConstraint());
    writeNode(tmpDir, makePattern());
    writeNode(tmpDir, makeSecurity());

    const { readAllNodes } = await import('../store/writer.js');
    const nodes = readAllNodes(tmpDir);

    // Simulate keyword scoring logic: 'auth' keyword
    const keywords = ['auth'];
    const scored = nodes
      .map(n => {
        const text = [n.id, n.type, ...n.scope, ...n.tags].join(' ').toLowerCase();
        const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
        return { node: n, score };
      })
      .filter(x => x.score > 0);

    expect(scored.length).toBeGreaterThan(0);
    expect(scored.some(x => x.node.id === 'constraint:no-refresh')).toBe(true);
  });

  it('returns empty for unmatched keywords', async () => {
    writeNode(tmpDir, makeConstraint());

    const { readAllNodes } = await import('../store/writer.js');
    const nodes = readAllNodes(tmpDir);

    const keywords = ['xyznonexistentterm'];
    const scored = nodes
      .map(n => {
        const text = [n.id, n.type, ...n.scope, ...n.tags].join(' ').toLowerCase();
        const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
        return { node: n, score };
      })
      .filter(x => x.score > 0);

    expect(scored.length).toBe(0);
  });

  it('matches on node id keywords', async () => {
    writeNode(tmpDir, makeConstraint());
    writeNode(tmpDir, makePattern());

    const { readAllNodes } = await import('../store/writer.js');
    const nodes = readAllNodes(tmpDir);

    const keywords = ['error'];
    const scored = nodes
      .map(n => {
        const text = [n.id, n.type, ...n.scope, ...n.tags].join(' ').toLowerCase();
        const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
        return { node: n, score };
      })
      .filter(x => x.score > 0);

    expect(scored.some(x => x.node.id === 'pattern:error-handling')).toBe(true);
  });

  it('matches on node tags', async () => {
    writeNode(tmpDir, makeSecurity());

    const { readAllNodes } = await import('../store/writer.js');
    const nodes = readAllNodes(tmpDir);

    const keywords = ['pii'];
    const scored = nodes
      .map(n => {
        const text = [n.id, n.type, ...n.scope, ...n.tags].join(' ').toLowerCase();
        const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
        return { node: n, score };
      })
      .filter(x => x.score > 0);

    expect(scored.some(x => x.node.id === 'security:never-log-pii')).toBe(true);
  });

  it('scores nodes with multiple keyword hits higher', async () => {
    writeNode(tmpDir, makeConstraint());
    writeNode(tmpDir, makePattern());

    const { readAllNodes } = await import('../store/writer.js');
    const nodes = readAllNodes(tmpDir);

    // 'constraint' + 'auth' both match the constraint node
    const keywords = ['constraint', 'auth'];
    const scored = nodes
      .map(n => {
        const text = [n.id, n.type, ...n.scope, ...n.tags].join(' ').toLowerCase();
        const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
        return { node: n, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    expect(scored[0].node.id).toBe('constraint:no-refresh');
    expect(scored[0].score).toBeGreaterThan(1);
  });
});
