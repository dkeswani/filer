import { describe, it, expect } from 'vitest';
import type { AnyNode } from '../schema/mod.js';

// ── Import pure helpers by re-implementing them locally for testing ────────────
// (They are not exported from measure.ts — we test the logic directly)

const now = new Date().toISOString();

function makeConstraint(mustNot: string[] = []): AnyNode {
  return {
    id: 'constraint:no-refresh', type: 'constraint',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope: ['src/auth/'], tags: [],
    confidence: 0.95, verified: false, stale_risk: 0,
    related: [], supersedes: [],
    must_not: mustNot,
    statement: 'Never implement token refresh.',
    because: 'Stateless auth.',
    if_violated: 'Circular dependency.',
  };
}

function makeSecurity(mustNot: string[] = []): AnyNode {
  return {
    id: 'security:no-pii', type: 'security',
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope: ['src/'], tags: [],
    confidence: 1.0, verified: true, stale_risk: 0,
    related: [], supersedes: [],
    must_not: mustNot,
    severity: 'critical', category: 'data-exposure',
    statement: 'Never log PII.',
    because: 'GDPR.',
    if_violated: 'Fines.',
    safe_pattern: 'Log id only.',
    audit_required: false,
    what_requires_audit: [], what_does_not_require_audit: [],
    verification_required: true,
  };
}

// ── Inline the pure functions from measure.ts ─────────────────────────────────

function classifyReviewComment(body: string): 'convention' | 'constraint' | 'logic' | 'style' {
  if (/security|auth|pii|token|encrypt|vulnerab|inject/i.test(body)) return 'constraint';
  if (/bug|incorrect|wrong|broken|null|undefined|crash|fail|throw/i.test(body)) return 'logic';
  if (/nit|style|format|naming|indent|whitespace|prefer|please use/i.test(body)) return 'style';
  return 'convention';
}

function checkDiffAgainstNodes(diff: string, nodes: AnyNode[]): number {
  let violations = 0;
  const diffLower = diff.toLowerCase();
  for (const node of nodes) {
    if (node.type !== 'constraint' && node.type !== 'security' && node.type !== 'antipattern') continue;
    for (const pattern of (node.must_not ?? [])) {
      if (diffLower.includes(pattern.toLowerCase())) violations++;
    }
  }
  return violations;
}

function detectOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (match) return { owner: match[1], repo: match[2] };
  return null;
}

// ── classifyReviewComment ─────────────────────────────────────────────────────

describe('classifyReviewComment', () => {
  it('classifies security/auth comments as constraint', () => {
    expect(classifyReviewComment('This could be a security vulnerability')).toBe('constraint');
    expect(classifyReviewComment('Never expose auth tokens here')).toBe('constraint');
    expect(classifyReviewComment('Do not log PII')).toBe('constraint');
  });

  it('classifies bug comments as logic', () => {
    expect(classifyReviewComment('This is wrong, it will crash')).toBe('logic');
    expect(classifyReviewComment('Null pointer bug here')).toBe('logic');
    expect(classifyReviewComment('This will fail when the list is empty')).toBe('logic');
  });

  it('classifies style comments as style', () => {
    expect(classifyReviewComment('nit: prefer const here')).toBe('style');
    expect(classifyReviewComment('please use camelCase naming')).toBe('style');
    expect(classifyReviewComment('indentation is off')).toBe('style');
  });

  it('defaults unknown comments to convention', () => {
    expect(classifyReviewComment('We handle this differently in our codebase')).toBe('convention');
    expect(classifyReviewComment('See the pattern in src/payments for how we do this')).toBe('convention');
  });
});

// ── checkDiffAgainstNodes ─────────────────────────────────────────────────────

describe('checkDiffAgainstNodes', () => {
  it('detects a must_not violation in a diff', () => {
    const nodes = [makeConstraint(['renewToken', 'refresh_token'])];
    const diff  = '+const t = renewToken(user.id);';
    expect(checkDiffAgainstNodes(diff, nodes)).toBe(1);
  });

  it('returns 0 for a clean diff', () => {
    const nodes = [makeConstraint(['renewToken'])];
    const diff  = '+const t = generateToken(user.id);';
    expect(checkDiffAgainstNodes(diff, nodes)).toBe(0);
  });

  it('counts violations across multiple nodes', () => {
    const nodes = [
      makeConstraint(['renewToken']),
      makeSecurity(['console.log(user.email)']),
    ];
    const diff = '+const t = renewToken(id);\n+console.log(user.email);';
    expect(checkDiffAgainstNodes(diff, nodes)).toBe(2);
  });

  it('ignores pattern and intent nodes (not checked)', () => {
    const patternNode: AnyNode = {
      id: 'pattern:x', type: 'pattern',
      version: 1, created_at: now, updated_at: now,
      indexed_by: 'model', scope: ['src/'], tags: [],
      confidence: 0.9, verified: false, stale_risk: 0,
      related: [], supersedes: [],
      must_not: ['renewToken'],
      statement: 'x', why: 'x', deviations: [],
    };
    const diff = '+const t = renewToken(id);';
    expect(checkDiffAgainstNodes(diff, [patternNode])).toBe(0);
  });

  it('is case-insensitive', () => {
    const nodes = [makeConstraint(['RenewToken'])];
    const diff  = '+const t = renewtoken(id);';
    expect(checkDiffAgainstNodes(diff, nodes)).toBe(1);
  });
});

// ── detectOwnerRepo ───────────────────────────────────────────────────────────

describe('detectOwnerRepo (remote URL parsing)', () => {
  it('parses HTTPS remote URL', () => {
    const result = detectOwnerRepo('https://github.com/dkeswani/filer');
    expect(result).toEqual({ owner: 'dkeswani', repo: 'filer' });
  });

  it('parses SSH remote URL', () => {
    const result = detectOwnerRepo('git@github.com:dkeswani/filer.git');
    expect(result).toEqual({ owner: 'dkeswani', repo: 'filer' });
  });

  it('returns null for non-GitHub remotes', () => {
    const result = detectOwnerRepo('https://gitlab.com/org/repo');
    expect(result).toBeNull();
  });
});
