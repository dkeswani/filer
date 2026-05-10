import { describe, it, expect } from 'vitest';
import { attachGoverns } from './attachment.js';
import type { ASTGraph } from './types.js';
import type { AnyNode } from '../schema/nodes.js';

const now = new Date().toISOString();

const baseNode = {
  version: 1, created_at: now, updated_at: now, indexed_by: 'test',
  tags: [], confidence: 0.9, verified: false, stale_risk: 0,
  related: [], supersedes: [], must_not: [],
};

const astGraph: ASTGraph = {
  nodes: [
    { id: 'ast:src/auth/validate.ts:0:file', kind: 'file',     name: 'src/auth/validate.ts', source_file: 'src/auth/validate.ts', line: 0,  language: 'typescript', exported: false },
    { id: 'ast:src/auth/validate.ts:5:validateJWT', kind: 'function', name: 'validateJWT', source_file: 'src/auth/validate.ts', line: 5, language: 'typescript', exported: true },
    { id: 'ast:src/api/handler.ts:0:file',  kind: 'file',     name: 'src/api/handler.ts',  source_file: 'src/api/handler.ts',  line: 0,  language: 'typescript', exported: false },
    { id: 'ast:src/api/handler.ts:10:handleRequest', kind: 'function', name: 'handleRequest', source_file: 'src/api/handler.ts', line: 10, language: 'typescript', exported: true },
  ],
  edges: [],
  stats: { files_scanned: 2, files_parsed: 2, files_skipped: 0, parse_errors: [] },
};

const constraint: AnyNode = {
  ...baseNode,
  id:          'constraint:no-refresh-in-auth',
  type:        'constraint',
  scope:       ['src/auth/'],
  statement:   'Never implement token refresh here.',
  because:     'Stateless.',
  if_violated: 'App fails to boot.',
};

const security: AnyNode = {
  ...baseNode,
  id:                  'security:never-log-pii',
  type:                'security',
  scope:               ['src/**'],
  severity:            'critical',
  category:            'data-exposure',
  statement:           'Never log PII.',
  because:             'GDPR.',
  if_violated:         'Regulatory exposure.',
  safe_pattern:        'Log user.id only.',
};

describe('attachGoverns', () => {
  it('emits governs edges for direct directory scope', () => {
    const result = attachGoverns([constraint], astGraph);
    const targets = result.edges.map(e => e.target);
    // Should match both nodes in src/auth/
    expect(targets).toContain('ast:src/auth/validate.ts:0:file');
    expect(targets).toContain('ast:src/auth/validate.ts:5:validateJWT');
    // Should NOT match src/api/
    expect(targets).not.toContain('ast:src/api/handler.ts:0:file');
  });

  it('emits governs edges for glob scope', () => {
    const result = attachGoverns([security], astGraph);
    const targets = result.edges.map(e => e.target);
    // src/** should match all 4 nodes
    expect(result.edges.length).toBe(4);
    expect(targets).toContain('ast:src/api/handler.ts:10:handleRequest');
  });

  it('sets source to the semantic node id', () => {
    const result = attachGoverns([constraint], astGraph);
    expect(result.edges.every(e => e.source === 'constraint:no-refresh-in-auth')).toBe(true);
  });

  it('sets relation to governs and confidence to EXTRACTED', () => {
    const result = attachGoverns([constraint], astGraph);
    expect(result.edges.every(e => e.relation === 'governs')).toBe(true);
    expect(result.edges.every(e => e.confidence === 'EXTRACTED')).toBe(true);
  });

  it('returns correct stats', () => {
    const result = attachGoverns([constraint, security], astGraph);
    expect(result.stats.semantic_nodes).toBe(2);
    expect(result.stats.governs_edges).toBe(result.edges.length);
  });

  it('emits no edges for empty scope', () => {
    const noScope: AnyNode = { ...constraint, id: 'constraint:noscope', scope: [] };
    const result = attachGoverns([noScope], astGraph);
    expect(result.edges).toHaveLength(0);
  });
});
