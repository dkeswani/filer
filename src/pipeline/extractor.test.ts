import { describe, it, expect } from 'vitest';
import { estimateModuleTokens } from '../pipeline/extractor.js';

// Note: extractNodes requires a live LLM gateway — tested via integration tests.
// Unit tests here cover the helper functions and validation logic.

describe('estimateModuleTokens', () => {
  it('estimates tokens as roughly chars/4', () => {
    const files = [{ content: 'a'.repeat(4000) }];
    const tokens = estimateModuleTokens(files);
    expect(tokens).toBe(1000);
  });

  it('sums multiple files', () => {
    const files = [
      { content: 'a'.repeat(4000) },
      { content: 'b'.repeat(4000) },
    ];
    const tokens = estimateModuleTokens(files);
    expect(tokens).toBe(2000);
  });

  it('rounds up', () => {
    const files = [{ content: 'a'.repeat(5) }];
    expect(estimateModuleTokens(files)).toBe(2);
  });
});
