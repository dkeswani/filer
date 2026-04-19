import { describe, it, expect } from 'vitest';
import type { AnyNode } from '../schema/mod.js';

// ── Inline the pure helpers from benchmark.ts for testing ─────────────────────

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

function getNodeSummary(node: { type: string; [k: string]: unknown }): string {
  switch (node.type) {
    case 'constraint':  return (node as any).statement;
    case 'danger':      return (node as any).statement;
    case 'assumption':  return (node as any).statement;
    case 'pattern':     return (node as any).statement;
    case 'intent':      return (node as any).purpose;
    case 'decision':    return (node as any).statement;
    case 'security':    return (node as any).statement;
    case 'antipattern': return (node as any).statement;
    default:            return '';
  }
}

const BUILTIN_TASKS: Record<string, { prompt: string; scope: string }> = {
  'implement-feature': {
    scope: 'src/',
    prompt: 'Implement a new user authentication endpoint. Describe the key considerations and potential pitfalls.',
  },
  'review-code': {
    scope: 'src/',
    prompt: 'Review this code for correctness, security, and adherence to project patterns:\n\nconst token = jwt.sign({ userId, email }, secret, { expiresIn: "30d" });',
  },
  'debug-issue': {
    scope: 'src/',
    prompt: 'A payment occasionally processes twice. What are the most likely causes and how would you fix them?',
  },
};

// ── avg ───────────────────────────────────────────────────────────────────────

describe('avg', () => {
  it('returns 0 for empty array', () => {
    expect(avg([])).toBe(0);
  });

  it('computes average correctly', () => {
    expect(avg([10, 20, 30])).toBe(20);
  });

  it('handles single element', () => {
    expect(avg([42])).toBe(42);
  });
});

// ── getNodeSummary ────────────────────────────────────────────────────────────

describe('getNodeSummary', () => {
  it('returns statement for constraint', () => {
    expect(getNodeSummary({ type: 'constraint', statement: 'No refresh tokens' })).toBe('No refresh tokens');
  });

  it('returns purpose for intent', () => {
    expect(getNodeSummary({ type: 'intent', purpose: 'Manages auth state' })).toBe('Manages auth state');
  });

  it('returns empty string for unknown type', () => {
    expect(getNodeSummary({ type: 'unknown' })).toBe('');
  });

  it('returns statement for security nodes', () => {
    expect(getNodeSummary({ type: 'security', statement: 'Never log PII' })).toBe('Never log PII');
  });
});

// ── BUILTIN_TASKS ─────────────────────────────────────────────────────────────

describe('BUILTIN_TASKS', () => {
  it('defines the three required tasks', () => {
    expect(BUILTIN_TASKS['implement-feature']).toBeDefined();
    expect(BUILTIN_TASKS['review-code']).toBeDefined();
    expect(BUILTIN_TASKS['debug-issue']).toBeDefined();
  });

  it('each task has a prompt and scope', () => {
    for (const [, task] of Object.entries(BUILTIN_TASKS)) {
      expect(task.prompt.length).toBeGreaterThan(10);
      expect(task.scope.length).toBeGreaterThan(0);
    }
  });
});

// ── delta score calculation ───────────────────────────────────────────────────

describe('delta score calculation', () => {
  it('computes positive delta when with-filer scores higher', () => {
    const without = [60, 65, 70];
    const with_   = [75, 80, 85];
    const delta = avg(with_) - avg(without);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBe(15);
  });

  it('computes negative delta when with-filer scores lower', () => {
    const without = [80, 85];
    const with_   = [70, 75];
    const delta = avg(with_) - avg(without);
    expect(delta).toBeLessThan(0);
  });

  it('computes zero delta for equal scores', () => {
    const scores = [75, 75, 75];
    expect(avg(scores) - avg(scores)).toBe(0);
  });
});
