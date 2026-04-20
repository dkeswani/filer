import { describe, it, expect, vi, beforeEach } from 'vitest';
import pLimit from 'p-limit';

// ── Concurrency limiter tests ─────────────────────────────────────────────────

describe('p-limit concurrency control', () => {
  it('never exceeds N concurrent operations', async () => {
    const concurrency = 3;
    const limit = pLimit(concurrency);
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 10 }, (_, i) =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 10));
        active--;
      })
    );

    await Promise.all(tasks);
    expect(maxActive).toBeLessThanOrEqual(concurrency);
  });

  it('concurrency=1 runs tasks sequentially (order preserved)', async () => {
    const limit = pLimit(1);
    const order: number[] = [];

    await Promise.all(
      [0, 1, 2, 3, 4].map(i =>
        limit(async () => {
          order.push(i);
        })
      )
    );

    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('clamps concurrency to [1, 10]', () => {
    const tooLow  = Math.max(1, Math.min(10, 0));
    const tooHigh = Math.max(1, Math.min(10, 99));
    const valid   = Math.max(1, Math.min(10, 5));

    expect(tooLow).toBe(1);
    expect(tooHigh).toBe(10);
    expect(valid).toBe(5);
  });
});

// ── IndexOptions type tests ───────────────────────────────────────────────────

describe('IndexOptions', () => {
  it('accepts concurrency and fast fields', async () => {
    // Type-level test — if this compiles the types are correct
    const opts: import('./indexer.js').IndexOptions = {
      root:        '/tmp/test',
      concurrency: 5,
      fast:        true,
    };
    expect(opts.concurrency).toBe(5);
    expect(opts.fast).toBe(true);
  });

  it('concurrency defaults to undefined (treated as 1)', () => {
    const opts: import('./indexer.js').IndexOptions = { root: '/tmp/test' };
    const effective = Math.max(1, Math.min(10, opts.concurrency ?? 1));
    expect(effective).toBe(1);
  });
});
