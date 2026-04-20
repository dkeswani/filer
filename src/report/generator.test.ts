import { describe, it, expect } from 'vitest';
import { generateReport, SEVERITY_MAP } from './generator.js';
import type { AnyNode } from '../schema/mod.js';

function makeNode(overrides: Partial<AnyNode> = {}): AnyNode {
  return {
    id:         'danger:test-node',
    type:       'danger',
    version:    1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    indexed_by: 'claude-sonnet-4-6',
    scope:      ['src/index.ts'],
    tags:       ['test'],
    confidence: 0.9,
    verified:   false,
    stale_risk: 0,
    related:    [],
    supersedes: [],
    must_not:   ['do bad thing'],
    statement:  'This is a test danger node',
    condition:  'When something bad happens',
    safe_pattern: 'Do the right thing instead',
    ...overrides,
  } as AnyNode;
}

const BASE_OPTS = {
  repoName:     'test/repo',
  scannedAt:    '2026-04-20T00:00:00.000Z',
  filesIndexed: 42,
  estimatedUsd: 0.5,
  model:        'claude-sonnet-4-6',
  rejected:     3,
};

describe('generateReport', () => {
  it('returns a string starting with <!DOCTYPE html>', () => {
    const html = generateReport({ ...BASE_OPTS, nodes: [] });
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('contains all node IDs from input', () => {
    const nodes = [
      makeNode({ id: 'danger:first-node' }),
      makeNode({ id: 'security:second-node', type: 'security',
        severity: 'critical', category: 'authorization',
        because: 'b', if_violated: 'v', safe_pattern: 's',
        statement: 's', audit_required: false,
        verification_required: true, what_requires_audit: [], what_does_not_require_audit: [],
      } as AnyNode),
    ];
    const html = generateReport({ ...BASE_OPTS, nodes });
    expect(html).toContain('danger:first-node');
    expect(html).toContain('security:second-node');
  });

  it('maps security type to CRITICAL severity', () => {
    expect(SEVERITY_MAP['security'].label).toBe('CRITICAL');
    expect(SEVERITY_MAP['security'].color).toBe('#dc2626');
  });

  it('maps danger type to HIGH severity', () => {
    expect(SEVERITY_MAP['danger'].label).toBe('HIGH');
    expect(SEVERITY_MAP['danger'].color).toBe('#ea580c');
  });

  it('maps constraint/assumption/antipattern to MEDIUM severity', () => {
    expect(SEVERITY_MAP['constraint'].label).toBe('MEDIUM');
    expect(SEVERITY_MAP['assumption'].label).toBe('MEDIUM');
    expect(SEVERITY_MAP['antipattern'].label).toBe('MEDIUM');
  });

  it('maps pattern/intent/decision to INFO severity', () => {
    expect(SEVERITY_MAP['pattern'].label).toBe('INFO');
    expect(SEVERITY_MAP['intent'].label).toBe('INFO');
    expect(SEVERITY_MAP['decision'].label).toBe('INFO');
  });

  it('produces a valid report with 0 findings', () => {
    const html = generateReport({ ...BASE_OPTS, nodes: [] });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Filer Scan');
    expect(html).toContain('0');
  });

  it('is self-contained — no external http:// src or href attributes', () => {
    const nodes = [makeNode()];
    const html  = generateReport({ ...BASE_OPTS, nodes });
    // Allow cdn.* only if using fallback — but brief says no external deps
    const externalRefs = html.match(/(src|href)="https?:\/\//gi) ?? [];
    expect(externalRefs).toHaveLength(0);
  });

  it('embeds node data as window.FILER_DATA JSON blob', () => {
    const nodes = [makeNode({ id: 'danger:embedded-check' })];
    const html  = generateReport({ ...BASE_OPTS, nodes });
    expect(html).toContain('window.FILER_DATA');
    expect(html).toContain('danger:embedded-check');
  });

  it('includes repo name in the report', () => {
    const html = generateReport({ ...BASE_OPTS, nodes: [], repoName: 'my-org/my-repo' });
    expect(html).toContain('my-org/my-repo');
  });
});
