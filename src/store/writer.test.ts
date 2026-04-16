import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ensureFilerDirs,
  writeNode,
  writeNodes,
  writeIndex,
  writeConfig,
  readNode,
  readAllNodes,
  readIndex,
  readConfig,
  filerExists,
  upsertNode,
  markStale,
  buildIndex,
  loadNodesForScope,
} from '../store/writer.js';
import type { AnyNode, FilerIndex } from '../schema/mod.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const now = new Date().toISOString();

function makeConstraint(id = 'constraint:no-refresh'): AnyNode {
  return {
    id, type: 'constraint',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope: ['src/auth/'],
    tags: ['auth'],
    confidence: 0.99,
    verified: false,
    stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    statement: 'Never implement token refresh here.',
    because: 'Auth is stateless.',
    if_violated: 'Circular dependency.',
  };
}

function makeSecurity(id = 'security:never-log-pii'): AnyNode {
  return {
    id, type: 'security',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope: ['src/'],
    tags: ['pii', 'gdpr'],
    confidence: 1.0,
    verified: true,
    stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    severity: 'critical',
    category: 'data-exposure',
    statement: 'Never log user PII.',
    because: 'GDPR.',
    if_violated: 'Regulatory exposure.',
    safe_pattern: 'Log user.id only.',
    audit_required: false,
    what_requires_audit: [],
    what_does_not_require_audit: [],
    verification_required: true,
  };
}

function makeDanger(id = 'danger:race-condition'): AnyNode {
  return {
    id, type: 'danger',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-haiku-4-5-20251001',
    scope: ['src/payments/'],
    tags: ['payments', 'concurrency'],
    confidence: 0.94,
    verified: false,
    stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    statement: 'Concurrent requests can double-charge.',
    condition: 'Two requests in same transaction window.',
    safe_pattern: 'Always set idempotency_key.',
  };
}

// ── Setup/teardown ────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filer-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Directory creation ────────────────────────────────────────────────────────

describe('ensureFilerDirs', () => {
  it('creates .filer/ and all type subdirectories', () => {
    ensureFilerDirs(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, '.filer'))).toBe(true);
    for (const type of ['intent','constraint','assumption','danger','pattern','decision','security','antipattern']) {
      expect(fs.existsSync(path.join(tmpDir, '.filer', type))).toBe(true);
    }
  });

  it('is idempotent', () => {
    ensureFilerDirs(tmpDir);
    ensureFilerDirs(tmpDir); // should not throw
    expect(fs.existsSync(path.join(tmpDir, '.filer'))).toBe(true);
  });
});

// ── Write and read nodes ──────────────────────────────────────────────────────

describe('writeNode / readNode', () => {
  it('writes and reads back a constraint node', () => {
    ensureFilerDirs(tmpDir);
    const node = makeConstraint();
    writeNode(tmpDir, node);

    const read = readNode(tmpDir, node.id);
    expect(read).not.toBeNull();
    expect(read!.id).toBe(node.id);
    expect(read!.type).toBe('constraint');
  });

  it('writes and reads back a security node', () => {
    ensureFilerDirs(tmpDir);
    const node = makeSecurity();
    writeNode(tmpDir, node);

    const read = readNode(tmpDir, node.id);
    expect(read).not.toBeNull();
    expect(read!.type).toBe('security');
    if (read!.type === 'security') {
      expect(read.severity).toBe('critical');
      expect(read.verified).toBe(true);
    }
  });

  it('returns null for non-existent node', () => {
    ensureFilerDirs(tmpDir);
    expect(readNode(tmpDir, 'constraint:does-not-exist')).toBeNull();
  });

  it('rejects invalid node on write', () => {
    ensureFilerDirs(tmpDir);
    expect(() => writeNode(tmpDir, { id: 'bad', type: 'constraint' } as AnyNode)).toThrow();
  });
});

// ── Write multiple nodes ──────────────────────────────────────────────────────

describe('writeNodes / readAllNodes', () => {
  it('writes multiple nodes and reads them all back', () => {
    ensureFilerDirs(tmpDir);
    const nodes = [makeConstraint(), makeSecurity(), makeDanger()];
    writeNodes(tmpDir, nodes);

    const all = readAllNodes(tmpDir);
    expect(all).toHaveLength(3);
    const types = all.map(n => n.type).sort();
    expect(types).toEqual(['constraint', 'danger', 'security']);
  });

  it('returns empty array when no nodes exist', () => {
    ensureFilerDirs(tmpDir);
    expect(readAllNodes(tmpDir)).toHaveLength(0);
  });

  it('returns empty array when .filer does not exist', () => {
    expect(readAllNodes(tmpDir)).toHaveLength(0);
  });
});

// ── Upsert ────────────────────────────────────────────────────────────────────

describe('upsertNode', () => {
  it('creates a new node when none exists', () => {
    ensureFilerDirs(tmpDir);
    const result = upsertNode(tmpDir, makeConstraint());
    expect(result.created).toBe(true);
  });

  it('updates existing node and increments version', () => {
    ensureFilerDirs(tmpDir);
    upsertNode(tmpDir, makeConstraint());

    const updated = { ...makeConstraint(), statement: 'Updated statement.' };
    const result = upsertNode(tmpDir, updated);
    expect(result.created).toBe(false);

    const read = readNode(tmpDir, 'constraint:no-refresh');
    expect(read!.version).toBe(2);
    if (read!.type === 'constraint') {
      expect(read.statement).toBe('Updated statement.');
    }
  });

  it('preserves human verification on update', () => {
    ensureFilerDirs(tmpDir);
    const node = { ...makeConstraint(), verified: true };
    upsertNode(tmpDir, node);

    // Incoming update with verified: false (LLM re-indexed)
    const reindexed = { ...makeConstraint(), verified: false, statement: 'New statement.' };
    upsertNode(tmpDir, reindexed);

    const read = readNode(tmpDir, 'constraint:no-refresh');
    expect(read!.verified).toBe(true);  // preserved
  });

  it('resets stale_risk on update', () => {
    ensureFilerDirs(tmpDir);
    const stale = { ...makeConstraint(), stale_risk: 0.8 };
    writeNode(tmpDir, stale);

    upsertNode(tmpDir, makeConstraint());

    const read = readNode(tmpDir, 'constraint:no-refresh');
    expect(read!.stale_risk).toBe(0);
  });
});

// ── Mark stale ────────────────────────────────────────────────────────────────

describe('markStale', () => {
  it('marks nodes as stale when their scope files change', () => {
    ensureFilerDirs(tmpDir);
    writeNode(tmpDir, makeConstraint());  // scope: src/auth/

    const count = markStale(tmpDir, ['src/auth/validate.ts']);
    expect(count).toBe(1);

    const read = readNode(tmpDir, 'constraint:no-refresh');
    expect(read!.stale_risk).toBeGreaterThan(0);
  });

  it('does not mark stale nodes with unrelated scope', () => {
    ensureFilerDirs(tmpDir);
    writeNode(tmpDir, makeConstraint());  // scope: src/auth/

    const count = markStale(tmpDir, ['src/payments/process.ts']);
    expect(count).toBe(0);
  });

  it('does not mark stale verified nodes', () => {
    ensureFilerDirs(tmpDir);
    writeNode(tmpDir, { ...makeConstraint(), verified: true });

    markStale(tmpDir, ['src/auth/validate.ts']);

    const read = readNode(tmpDir, 'constraint:no-refresh');
    expect(read!.stale_risk).toBe(0);  // verified nodes are immune
  });
});

// ── Build and write index ─────────────────────────────────────────────────────

describe('buildIndex / writeIndex / readIndex', () => {
  it('builds a valid index from nodes on disk', () => {
    ensureFilerDirs(tmpDir);
    writeNodes(tmpDir, [makeConstraint(), makeSecurity(), makeDanger()]);

    const index = buildIndex(tmpDir, {
      repo: 'test-repo',
      llm: 'claude-sonnet-4-6',
      files_indexed: 50,
    });

    expect(index.stats.nodes_total).toBe(3);
    expect(index.stats.by_type['constraint']).toBe(1);
    expect(index.stats.by_type['security']).toBe(1);
    expect(index.stats.by_type['danger']).toBe(1);
    expect(index.nodes).toHaveLength(3);
  });

  it('writes and reads back the index', () => {
    ensureFilerDirs(tmpDir);
    writeNodes(tmpDir, [makeConstraint()]);

    const index = buildIndex(tmpDir, {
      repo: 'test-repo',
      llm: 'claude-sonnet-4-6',
      files_indexed: 10,
    });
    writeIndex(tmpDir, index);

    const read = readIndex(tmpDir);
    expect(read).not.toBeNull();
    expect(read!.repo).toBe('test-repo');
    expect(read!.nodes).toHaveLength(1);
  });

  it('returns null when no index exists', () => {
    expect(readIndex(tmpDir)).toBeNull();
  });
});

// ── Config ────────────────────────────────────────────────────────────────────

describe('writeConfig / readConfig', () => {
  it('writes and reads back config', () => {
    ensureFilerDirs(tmpDir);
    const config = {
      version: '1.0',
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
    writeConfig(tmpDir, config);

    const read = readConfig(tmpDir);
    expect(read).not.toBeNull();
    expect(read!.llm.provider).toBe('anthropic');
    expect(read!.auto_update).toBe(true);
  });
});

// ── Scope-based node loading ──────────────────────────────────────────────────

describe('loadNodesForScope', () => {
  it('returns nodes relevant to given file paths', () => {
    ensureFilerDirs(tmpDir);
    writeNodes(tmpDir, [makeConstraint(), makeDanger()]);  // auth vs payments

    const index = buildIndex(tmpDir, {
      repo: 'test', llm: 'claude-sonnet-4-6', files_indexed: 10,
    });
    writeIndex(tmpDir, index);

    const authNodes = loadNodesForScope(tmpDir, ['src/auth/validate.ts']);
    expect(authNodes.some(n => n.id === 'constraint:no-refresh')).toBe(true);
    expect(authNodes.some(n => n.id === 'danger:race-condition')).toBe(false);
  });

  it('sorts by priority — security before constraint before danger', () => {
    ensureFilerDirs(tmpDir);
    const secNode = { ...makeSecurity(), scope: ['src/auth/'] };
    writeNodes(tmpDir, [makeConstraint(), secNode]);

    const index = buildIndex(tmpDir, {
      repo: 'test', llm: 'claude-sonnet-4-6', files_indexed: 10,
    });
    writeIndex(tmpDir, index);

    const nodes = loadNodesForScope(tmpDir, ['src/auth/validate.ts']);
    expect(nodes[0].type).toBe('security');  // security first
    expect(nodes[1].type).toBe('constraint');
  });

  it('returns empty array when no index exists', () => {
    expect(loadNodesForScope(tmpDir, ['src/auth/validate.ts'])).toHaveLength(0);
  });
});

// ── filerExists ───────────────────────────────────────────────────────────────

describe('filerExists', () => {
  it('returns false when .filer does not exist', () => {
    expect(filerExists(tmpDir)).toBe(false);
  });

  it('returns true after ensureFilerDirs', () => {
    ensureFilerDirs(tmpDir);
    expect(filerExists(tmpDir)).toBe(true);
  });
});
