import { describe, it, expect } from 'vitest';
import { parseJSON } from '../llm/gateway.js';

describe('parseJSON', () => {
  it('parses a clean JSON array', () => {
    const result = parseJSON<unknown[]>('[{"type":"constraint","id":"constraint:test"}]');
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].type).toBe('constraint');
  });

  it('strips json code fences', () => {
    const raw = '```json\n[{"id":"constraint:test"}]\n```';
    const result = parseJSON<unknown[]>(raw);
    expect(Array.isArray(result)).toBe(true);
  });

  it('strips bare code fences', () => {
    const raw = '```\n[{"id":"constraint:test"}]\n```';
    const result = parseJSON<unknown[]>(raw);
    expect(Array.isArray(result)).toBe(true);
  });

  it('extracts JSON array from surrounding prose', () => {
    const raw = 'Here are the nodes:\n[{"id":"constraint:test"}]\nDone.';
    const result = parseJSON<unknown[]>(raw);
    expect(Array.isArray(result)).toBe(true);
  });

  it('parses an empty array', () => {
    const result = parseJSON<unknown[]>('[]');
    expect(result).toEqual([]);
  });

  it('throws on unparseable input', () => {
    expect(() => parseJSON('not json at all')).toThrow();
  });

  it('parses a JSON object', () => {
    const result = parseJSON<Record<string, string>>('{"key":"value"}');
    expect((result as any).key).toBe('value');
  });
});
