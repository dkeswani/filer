import { z } from 'zod';

// ── Base node schema shared by all types ─────────────────────────────────────

export const BaseNodeSchema = z.object({
  id:          z.string().regex(/^[a-z]+:[a-z0-9-]+$/, 'ID must be type:slug format'),
  type:        z.enum(['intent', 'constraint', 'assumption', 'danger', 'pattern', 'decision', 'security', 'antipattern']),
  version:     z.number().int().min(1).default(1),
  created_at:  z.string().datetime(),
  updated_at:  z.string().datetime(),
  indexed_by:  z.string(),           // LLM model that produced this node
  scope:       z.array(z.string()).min(1),  // file paths or glob patterns
  tags:        z.array(z.string()).default([]),
  confidence:  z.number().min(0).max(1),
  verified:    z.boolean().default(false),
  stale_risk:  z.number().min(0).max(1).default(0),
  related:     z.array(z.string()).default([]),
  supersedes:  z.array(z.string()).default([]),
  must_not:    z.array(z.string()).default([]),
});

export type BaseNode = z.infer<typeof BaseNodeSchema>;

// ── Intent ────────────────────────────────────────────────────────────────────

export const IntentNodeSchema = BaseNodeSchema.extend({
  type:         z.literal('intent'),
  purpose:      z.string().min(1),
  owns:         z.array(z.string()).default([]),
  does_not_own: z.array(z.string()).default([]),
  entry_points: z.array(z.string()).default([]),
});

export type IntentNode = z.infer<typeof IntentNodeSchema>;

// ── Constraint ────────────────────────────────────────────────────────────────

export const ConstraintNodeSchema = BaseNodeSchema.extend({
  type:        z.literal('constraint'),
  statement:   z.string().min(1),
  because:     z.string().min(1),
  if_violated: z.string().min(1),
  instead:     z.string().optional(),
});

export type ConstraintNode = z.infer<typeof ConstraintNodeSchema>;

// ── Assumption ────────────────────────────────────────────────────────────────

export const AssumptionNodeSchema = BaseNodeSchema.extend({
  type:         z.literal('assumption'),
  statement:    z.string().min(1),
  relied_on_by: z.array(z.string()).default([]),
  breaks_when:  z.string().min(1),
  boundary:     z.string().optional(),
});

export type AssumptionNode = z.infer<typeof AssumptionNodeSchema>;

// ── Danger ────────────────────────────────────────────────────────────────────

export const DangerNodeSchema = BaseNodeSchema.extend({
  type:                  z.literal('danger'),
  statement:             z.string().min(1),
  condition:             z.string().min(1),
  frequency:             z.string().optional(),
  current_mitigation:    z.string().optional(),
  not_fixed_because:     z.string().optional(),
  safe_pattern:          z.string().min(1),
  history:               z.string().optional(),
});

export type DangerNode = z.infer<typeof DangerNodeSchema>;

// ── Pattern ───────────────────────────────────────────────────────────────────

export const PatternNodeSchema = BaseNodeSchema.extend({
  type:         z.literal('pattern'),
  statement:    z.string().min(1),
  structure:    z.string().optional(),
  why:          z.string().min(1),
  anti_pattern: z.string().optional(),
  deviations:   z.array(z.object({
    scope:  z.string(),
    reason: z.string(),
  })).default([]),
});

export type PatternNode = z.infer<typeof PatternNodeSchema>;

// ── Decision ──────────────────────────────────────────────────────────────────

export const DecisionNodeSchema = BaseNodeSchema.extend({
  type:                 z.literal('decision'),
  statement:            z.string().min(1),
  reason:               z.string().min(1),
  alternatives_rejected: z.array(z.object({
    option:        z.string(),
    why_rejected:  z.string(),
  })).default([]),
  decided_at:    z.string().optional(),
  revisit_if:    z.string().optional(),
});

export type DecisionNode = z.infer<typeof DecisionNodeSchema>;

// ── Security ──────────────────────────────────────────────────────────────────

export const SecurityNodeSchema = BaseNodeSchema.extend({
  type:                    z.literal('security'),
  severity:                z.enum(['critical', 'high', 'medium']),
  category:                z.enum([
    'data-exposure',
    'authorization',
    'authentication',
    'audit',
    'input-validation',
    'secrets',
    'compliance',
  ]),
  statement:               z.string().min(1),
  because:                 z.string().min(1),
  if_violated:             z.string().min(1),
  safe_pattern:            z.string().min(1),
  audit_required:          z.boolean().default(false),
  audit_schema:            z.record(z.string()).optional(),
  audit_format:            z.string().optional(),
  timing:                  z.string().optional(),
  what_requires_audit:     z.array(z.string()).default([]),
  what_does_not_require_audit: z.array(z.string()).default([]),
  verification_required:   z.boolean().default(true),
});

export type SecurityNode = z.infer<typeof SecurityNodeSchema>;

// ── Antipattern ───────────────────────────────────────────────────────────────

export const AntipatternNodeSchema = BaseNodeSchema.extend({
  type:                z.literal('antipattern'),
  statement:           z.string().min(1),
  why_it_looks_right:  z.string().min(1),
  why_its_wrong_here:  z.string().min(1),
  correct_pattern:     z.string().min(1),
  seen_in:             z.string().optional(),
  history:             z.string().optional(),
});

export type AntipatternNode = z.infer<typeof AntipatternNodeSchema>;

// ── Union type ────────────────────────────────────────────────────────────────

export const AnyNodeSchema = z.discriminatedUnion('type', [
  IntentNodeSchema,
  ConstraintNodeSchema,
  AssumptionNodeSchema,
  DangerNodeSchema,
  PatternNodeSchema,
  DecisionNodeSchema,
  SecurityNodeSchema,
  AntipatternNodeSchema,
]);

export type AnyNode = z.infer<typeof AnyNodeSchema>;
export type NodeType = AnyNode['type'];

export const NODE_TYPES: NodeType[] = [
  'intent',
  'constraint',
  'assumption',
  'danger',
  'pattern',
  'decision',
  'security',
  'antipattern',
];

// Priority order for agent loading — critical types first
export const NODE_PRIORITY: Record<NodeType, number> = {
  security:    0,
  constraint:  1,
  danger:      2,
  assumption:  3,
  antipattern: 4,
  pattern:     5,
  intent:      6,
  decision:    7,
};
