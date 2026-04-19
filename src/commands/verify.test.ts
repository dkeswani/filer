import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import {
  ensureFilerDirs,
  writeNode,
  readNode,
  readAllNodes,
  writeConfig,
} from '../store/writer.js';
import type { AnyNode } from '../schema/mod.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

function makeConstraint(overrides: Partial<AnyNode> = {}): AnyNode {
  return {
    id: 'constraint:no-refresh',
    type: 'constraint',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope: ['src/auth/'],
    tags: ['auth'],
    confidence: 0.95,
    verified: false,
    stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    statement: 'Never implement token refresh in auth module.',
    because: 'Auth is stateless.',
    if_violated: 'Circular dependency.',
    ...overrides,
  } as AnyNode;
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

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filer-verify-test-'));
  ensureFilerDirs(tmpDir);
  writeConfig(tmpDir, makeConfig());
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('verify — node state transitions', () => {
  it('marking verified sets verified=true and stale_risk=0', () => {
    writeNode(tmpDir, makeConstraint({ verified: false, stale_risk: 0.6 }));

    const node = readNode(tmpDir, 'constraint:no-refresh')!;
    writeNode(tmpDir, { ...node, verified: true, stale_risk: 0 });

    const updated = readNode(tmpDir, 'constraint:no-refresh')!;
    expect(updated.verified).toBe(true);
    expect(updated.stale_risk).toBe(0);
  });

  it('marking rejected sets verified=false and stale_risk=1.0', () => {
    writeNode(tmpDir, makeConstraint({ verified: true, stale_risk: 0 }));

    const node = readNode(tmpDir, 'constraint:no-refresh')!;
    writeNode(tmpDir, { ...node, verified: false, stale_risk: 1.0 });

    const updated = readNode(tmpDir, 'constraint:no-refresh')!;
    expect(updated.verified).toBe(false);
    expect(updated.stale_risk).toBe(1.0);
  });

  it('skipping leaves node unchanged', () => {
    writeNode(tmpDir, makeConstraint({ verified: false, stale_risk: 0.4 }));

    const before = readNode(tmpDir, 'constraint:no-refresh')!;
    // Skip: no write
    const after = readNode(tmpDir, 'constraint:no-refresh')!;

    expect(after.verified).toBe(before.verified);
    expect(after.stale_risk).toBe(before.stale_risk);
  });

  it('can verify multiple nodes independently', () => {
    const a = makeConstraint({ id: 'constraint:no-refresh', verified: false });
    const b: AnyNode = {
      id: 'constraint:no-direct-db',
      type: 'constraint',
      version: 1, created_at: now, updated_at: now,
      indexed_by: 'claude-sonnet-4-6',
      scope: ['src/api/'],
      tags: [],
      confidence: 0.85,
      verified: false,
      stale_risk: 0.5,
      related: [], supersedes: [], must_not: [],
      statement: 'API layer must not access DB directly.',
      because: 'Layered architecture.',
      if_violated: 'Bypasses business logic.',
    };

    writeNode(tmpDir, a);
    writeNode(tmpDir, b);

    // Verify only 'a'
    writeNode(tmpDir, { ...a, verified: true, stale_risk: 0 });

    expect(readNode(tmpDir, 'constraint:no-refresh')!.verified).toBe(true);
    expect(readNode(tmpDir, 'constraint:no-direct-db')!.verified).toBe(false);
  });

  it('stale nodes (stale_risk >= 0.5) are filterable', () => {
    writeNode(tmpDir, makeConstraint({ id: 'constraint:stale-one', stale_risk: 0.7 }));
    writeNode(tmpDir, makeConstraint({ id: 'constraint:fresh-one', stale_risk: 0.1 }));

    const nodes: AnyNode[] = readAllNodes(tmpDir);
    const stale = nodes.filter(n => n.stale_risk >= 0.5);

    expect(stale.some(n => n.id === 'constraint:stale-one')).toBe(true);
    expect(stale.every(n => n.id !== 'constraint:fresh-one')).toBe(true);
  });
});
