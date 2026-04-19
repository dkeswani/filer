import { describe, it, expect } from 'vitest';
import { clusterSignals, crossReferenceNodes } from './learn.js';
import type { AnyNode } from '../schema/mod.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

function makeSignal(overrides: {
  pr?: number; signal_type?: string; text?: string; file?: string;
  author?: string; confidence?: number;
}) {
  return {
    pr:          overrides.pr ?? 1,
    author:      overrides.author ?? 'reviewer',
    text:        overrides.text ?? 'generic comment',
    file:        overrides.file ?? 'src/auth/index.ts',
    signal_type: overrides.signal_type ?? 'constraint',
    confidence:  overrides.confidence ?? 0.85,
  };
}

function makeConstraint(id = 'constraint:no-refresh'): AnyNode {
  return {
    id, type: 'constraint',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope: ['src/auth/'],
    tags: ['auth'],
    confidence: 0.95,
    verified: false, stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    statement: 'Never implement token refresh in auth module.',
    because: 'Auth is stateless.',
    if_violated: 'Circular dependency.',
  };
}

// ── clusterSignals ────────────────────────────────────────────────────────────

describe('clusterSignals', () => {
  it('groups signals with shared keywords into one cluster', () => {
    const signals = [
      makeSignal({ text: 'never use refresh token here it breaks auth', signal_type: 'constraint' }),
      makeSignal({ text: 'do not refresh tokens in this auth module',   signal_type: 'constraint' }),
    ];
    const clusters = clusterSignals(signals);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].signals).toHaveLength(2);
  });

  it('separates signals of different types even with shared keywords', () => {
    const signals = [
      makeSignal({ text: 'never log user passwords here', signal_type: 'security' }),
      makeSignal({ text: 'never log user passwords here', signal_type: 'constraint' }),
    ];
    const clusters = clusterSignals(signals);
    expect(clusters).toHaveLength(2);
  });

  it('separates signals with no keyword overlap', () => {
    const signals = [
      makeSignal({ text: 'token refresh breaks circular dependency chain', signal_type: 'constraint' }),
      makeSignal({ text: 'payment idempotency must always check database',  signal_type: 'constraint' }),
    ];
    const clusters = clusterSignals(signals);
    expect(clusters).toHaveLength(2);
  });

  it('handles a single signal as a cluster of one', () => {
    const signals = [makeSignal({ text: 'never bypass rate limiting middleware' })];
    const clusters = clusterSignals(signals);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].signals).toHaveLength(1);
  });

  it('merges keywords from grouped signals', () => {
    const signals = [
      makeSignal({ text: 'token refresh causes auth loop',        signal_type: 'constraint' }),
      makeSignal({ text: 'refresh token always invalidates session', signal_type: 'constraint' }),
    ];
    const clusters = clusterSignals(signals);
    expect(clusters[0].keywords.length).toBeGreaterThan(3);
  });

  it('returns empty array for empty input', () => {
    expect(clusterSignals([])).toHaveLength(0);
  });
});

// ── crossReferenceNodes ───────────────────────────────────────────────────────

describe('crossReferenceNodes', () => {
  it('matches a cluster to an existing node with keyword overlap', () => {
    const clusters = clusterSignals([
      makeSignal({
        text: 'never implement token refresh in auth module it will break',
        signal_type: 'constraint',
      }),
    ]);
    const nodes = [makeConstraint('constraint:no-refresh')];
    const result = crossReferenceNodes(clusters, nodes);

    expect(result[0].existingNode).not.toBeNull();
    expect(result[0].existingNode!.id).toBe('constraint:no-refresh');
  });

  it('leaves existingNode null when no match', () => {
    const clusters = clusterSignals([
      makeSignal({ text: 'payment service must use idempotency keys', signal_type: 'constraint' }),
    ]);
    const nodes = [makeConstraint('constraint:no-refresh')]; // unrelated node
    const result = crossReferenceNodes(clusters, nodes);
    expect(result[0].existingNode).toBeNull();
  });

  it('only matches nodes of the same type as the cluster signal_type', () => {
    const clusters = clusterSignals([
      makeSignal({ text: 'never log token refresh attempts', signal_type: 'security' }),
    ]);
    // constraint node won't match even with keyword overlap
    const nodes = [makeConstraint('constraint:no-refresh')];
    const result = crossReferenceNodes(clusters, nodes);
    expect(result[0].existingNode).toBeNull();
  });

  it('handles empty nodes list', () => {
    const clusters = clusterSignals([makeSignal({ text: 'never bypass rate limiter' })]);
    const result = crossReferenceNodes(clusters, []);
    expect(result[0].existingNode).toBeNull();
  });

  it('handles empty clusters list', () => {
    const nodes = [makeConstraint()];
    expect(crossReferenceNodes([], nodes)).toHaveLength(0);
  });
});
