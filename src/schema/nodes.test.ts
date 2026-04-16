import { describe, it, expect } from 'vitest';
import {
  IntentNodeSchema,
  ConstraintNodeSchema,
  AssumptionNodeSchema,
  DangerNodeSchema,
  PatternNodeSchema,
  DecisionNodeSchema,
  SecurityNodeSchema,
  AntipatternNodeSchema,
  AnyNodeSchema,
  FilerConfigSchema,
  FilerIndexSchema,
} from '../schema/mod.js';

const now = new Date().toISOString();

const base = {
  version:    1,
  created_at: now,
  updated_at: now,
  indexed_by: 'claude-sonnet-4-6',
  scope:      ['src/auth/'],
  tags:       ['auth'],
  confidence: 0.95,
  verified:   false,
  stale_risk: 0,
  related:    [],
  supersedes: [],
  must_not:   [],
};

// ── Intent ────────────────────────────────────────────────────────────────────

describe('IntentNode', () => {
  it('validates a valid intent node', () => {
    const node = IntentNodeSchema.parse({
      ...base,
      id:           'intent:auth-pipeline',
      type:         'intent',
      purpose:      'Validate inbound JWTs and attach verified identity to request context.',
      owns:         ['JWT validation', 'Token expiry'],
      does_not_own: ['Token refresh', 'Authorization'],
      entry_points: ['src/auth/validate.ts'],
    });
    expect(node.type).toBe('intent');
    expect(node.purpose).toBeTruthy();
  });

  it('rejects missing purpose', () => {
    expect(() => IntentNodeSchema.parse({
      ...base, id: 'intent:auth', type: 'intent',
    })).toThrow();
  });
});

// ── Constraint ────────────────────────────────────────────────────────────────

describe('ConstraintNode', () => {
  it('validates a valid constraint node', () => {
    const node = ConstraintNodeSchema.parse({
      ...base,
      id:          'constraint:no-refresh-in-auth',
      type:        'constraint',
      statement:   'Never implement token refresh in this module.',
      because:     'Auth is stateless. Refresh requires session state. Creates circular dependency.',
      if_violated: 'Circular import at startup. App fails to boot.',
      instead:     'Implement refresh in src/session/refresh.ts',
    });
    expect(node.type).toBe('constraint');
    expect(node.statement).toBeTruthy();
    expect(node.because).toBeTruthy();
    expect(node.if_violated).toBeTruthy();
  });

  it('rejects missing if_violated', () => {
    expect(() => ConstraintNodeSchema.parse({
      ...base,
      id:        'constraint:test',
      type:      'constraint',
      statement: 'Never do X.',
      because:   'Because Y.',
    })).toThrow();
  });
});

// ── Assumption ────────────────────────────────────────────────────────────────

describe('AssumptionNode', () => {
  it('validates a valid assumption node', () => {
    const node = AssumptionNodeSchema.parse({
      ...base,
      id:           'assumption:user-id-always-uuid',
      type:         'assumption',
      statement:    'All user IDs entering this module are UUID v4 strings.',
      relied_on_by: ['Database queries', 'Cache keys'],
      breaks_when:  'Integer IDs from billing module are passed directly.',
      boundary:     'Use UserID.fromBilling(id) when crossing the billing boundary.',
    });
    expect(node.type).toBe('assumption');
    expect(node.breaks_when).toBeTruthy();
  });
});

// ── Danger ────────────────────────────────────────────────────────────────────

describe('DangerNode', () => {
  it('validates a valid danger node', () => {
    const node = DangerNodeSchema.parse({
      ...base,
      id:           'danger:payment-race-condition',
      type:         'danger',
      statement:    'Concurrent payment requests for the same order can double-charge.',
      condition:    'Two requests arrive within the same DB transaction window.',
      safe_pattern: 'Always set idempotency_key = order.id + attempt number.',
    });
    expect(node.type).toBe('danger');
    expect(node.safe_pattern).toBeTruthy();
  });

  it('rejects missing safe_pattern', () => {
    expect(() => DangerNodeSchema.parse({
      ...base,
      id:        'danger:test',
      type:      'danger',
      statement: 'This is dangerous.',
      condition: 'Under load.',
    })).toThrow();
  });
});

// ── Pattern ───────────────────────────────────────────────────────────────────

describe('PatternNode', () => {
  it('validates a valid pattern node', () => {
    const node = PatternNodeSchema.parse({
      ...base,
      id:        'pattern:error-handling',
      type:      'pattern',
      statement: 'All thrown errors are instances of AppError.',
      why:       'Centralizes error serialization for the API response layer.',
      deviations: [{ scope: 'src/legacy/', reason: 'Predates AppError.' }],
    });
    expect(node.type).toBe('pattern');
    expect(node.deviations).toHaveLength(1);
  });
});

// ── Decision ──────────────────────────────────────────────────────────────────

describe('DecisionNode', () => {
  it('validates a valid decision node', () => {
    const node = DecisionNodeSchema.parse({
      ...base,
      id:        'decision:rs256-only',
      type:      'decision',
      statement: 'JWT validation uses RS256 exclusively.',
      reason:    'RS256 allows public key verification without sharing the signing secret.',
      alternatives_rejected: [
        { option: 'HS256', why_rejected: 'Requires sharing symmetric secret.' },
      ],
    });
    expect(node.type).toBe('decision');
    expect(node.alternatives_rejected).toHaveLength(1);
  });
});

// ── Security ──────────────────────────────────────────────────────────────────

describe('SecurityNode', () => {
  it('validates a critical security node', () => {
    const node = SecurityNodeSchema.parse({
      ...base,
      id:           'security:never-log-pii',
      type:         'security',
      severity:     'critical',
      category:     'data-exposure',
      statement:    'Never log user PII.',
      because:      'GDPR Article 32 and SOC 2 CC6.1.',
      if_violated:  'Regulatory exposure. Mandatory incident report within 72h.',
      safe_pattern: 'Log user.id only, never user.email or user.name.',
    });
    expect(node.type).toBe('security');
    expect(node.severity).toBe('critical');
    expect(node.verification_required).toBe(true);
  });

  it('rejects invalid severity', () => {
    expect(() => SecurityNodeSchema.parse({
      ...base,
      id:           'security:test',
      type:         'security',
      severity:     'low',   // invalid
      category:     'audit',
      statement:    'Test.',
      because:      'Because.',
      if_violated:  'Bad things.',
      safe_pattern: 'Do X instead.',
    })).toThrow();
  });

  it('rejects invalid category', () => {
    expect(() => SecurityNodeSchema.parse({
      ...base,
      id:           'security:test',
      type:         'security',
      severity:     'high',
      category:     'xss',   // invalid
      statement:    'Test.',
      because:      'Because.',
      if_violated:  'Bad things.',
      safe_pattern: 'Do X instead.',
    })).toThrow();
  });
});

// ── Antipattern ───────────────────────────────────────────────────────────────

describe('AntipatternNode', () => {
  it('validates a valid antipattern node', () => {
    const node = AntipatternNodeSchema.parse({
      ...base,
      id:                  'antipattern:direct-db-from-handler',
      type:                'antipattern',
      statement:           'Do not query the database directly from API handlers.',
      why_it_looks_right:  'It is the simplest path — DB client is available.',
      why_its_wrong_here:  'Bypasses the service layer where authorization checks live.',
      correct_pattern:     'API handler → service function → repository → DB.',
    });
    expect(node.type).toBe('antipattern');
    expect(node.why_its_wrong_here).toBeTruthy();
  });
});

// ── Discriminated union ───────────────────────────────────────────────────────

describe('AnyNodeSchema', () => {
  it('discriminates by type field correctly', () => {
    const node = AnyNodeSchema.parse({
      ...base,
      id:           'security:test',
      type:         'security',
      severity:     'high',
      category:     'authorization',
      statement:    'Always call authorize() before fetching.',
      because:      'Prevents TOCTOU attacks.',
      if_violated:  'Horizontal privilege escalation.',
      safe_pattern: 'authorize() then fetch().',
    });
    expect(node.type).toBe('security');
  });

  it('rejects unknown type', () => {
    expect(() => AnyNodeSchema.parse({
      ...base, id: 'unknown:test', type: 'unknown',
    })).toThrow();
  });

  it('rejects malformed ID', () => {
    expect(() => AnyNodeSchema.parse({
      ...base,
      id:          'no-colon-here',
      type:        'intent',
      purpose:     'Test.',
    })).toThrow();
  });
});

// ── Config ────────────────────────────────────────────────────────────────────

describe('FilerConfig', () => {
  it('parses with full defaults', () => {
    const config = FilerConfigSchema.parse({
      llm: { provider: 'anthropic' },
    });
    expect(config.llm.provider).toBe('anthropic');
    expect(config.auto_update).toBe(true);
    expect(config.include).toContain('src/**');
  });

  it('parses ollama provider', () => {
    const config = FilerConfigSchema.parse({
      llm: { provider: 'ollama', model: 'llama3.3', base_url: 'http://localhost:11434' },
    });
    expect(config.llm.provider).toBe('ollama');
    expect(config.llm.base_url).toBe('http://localhost:11434');
  });
});

// ── Index ─────────────────────────────────────────────────────────────────────

describe('FilerIndex', () => {
  it('validates a well-formed index', () => {
    const index = FilerIndexSchema.parse({
      filer_version: '1.0',
      repo:          'my-app',
      indexed_at:    now,
      llm:           'claude-sonnet-4-6',
      stats: {
        files_indexed: 100,
        nodes_total:   12,
        by_type: {
          intent: 2, constraint: 3, assumption: 2,
          danger: 1, pattern: 2, decision: 1,
          security: 1, antipattern: 0,
        },
        coverage_pct: 80,
        verified_pct: 40,
        stale_count:  1,
      },
      nodes: [],
    });
    expect(index.filer_version).toBe('1.0');
    expect(index.stats.nodes_total).toBe(12);
  });
});
