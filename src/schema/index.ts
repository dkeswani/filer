import { z } from 'zod';
import { NODE_TYPES } from './nodes.js';

// ── Node summary entry in index.json ─────────────────────────────────────────

export const NodeSummarySchema = z.object({
  id:         z.string(),
  type:       z.enum(NODE_TYPES as [string, ...string[]]),
  file:       z.string(),   // relative path within .filer/
  scope:      z.array(z.string()),
  summary:    z.string(),   // one-line description for quick scanning
  tags:       z.array(z.string()),
  confidence: z.number().min(0).max(1),
  verified:   z.boolean(),
  stale_risk: z.number().min(0).max(1),
  updated_at: z.string().datetime(),
});

export type NodeSummary = z.infer<typeof NodeSummarySchema>;

// ── Stats block ───────────────────────────────────────────────────────────────

export const IndexStatsSchema = z.object({
  files_indexed:    z.number().int(),
  nodes_total:      z.number().int(),
  by_type:          z.record(z.number().int()),
  coverage_pct:     z.number().min(0).max(100),
  verified_pct:     z.number().min(0).max(100),
  stale_count:      z.number().int(),
});

export type IndexStats = z.infer<typeof IndexStatsSchema>;

// ── Full index.json schema ────────────────────────────────────────────────────

export const FilerIndexSchema = z.object({
  filer_version: z.string(),
  repo:          z.string(),
  indexed_at:    z.string().datetime(),
  last_commit:   z.string().optional(),
  llm:           z.string(),
  stats:         IndexStatsSchema,
  nodes:         z.array(NodeSummarySchema),
});

export type FilerIndex = z.infer<typeof FilerIndexSchema>;

// ── Config schema (.filer/.filer-config.json) ─────────────────────────────────

export const NodeTypeConfigSchema = z.object({
  enabled:              z.boolean().default(true),
  min_confidence:       z.number().min(0).max(1).default(0.80),
  require_verification: z.boolean().default(false),
});

export const FilerConfigSchema = z.object({
  version: z.string().default('1.0'),

  llm: z.object({
    provider:       z.enum(['anthropic', 'openai', 'ollama', 'kimi']).default('anthropic'),
    model:          z.string().default('claude-sonnet-4-6'),
    indexing_model: z.string().default('claude-haiku-4-5-20251001'),
    deep_model:     z.string().default('claude-sonnet-4-6'),
    base_url:       z.string().optional(),   // for ollama
  }),

  include: z.array(z.string()).default(['src/**', 'lib/**', 'app/**']),
  exclude: z.array(z.string()).default([
    '**/*.test.ts',
    '**/*.test.js',
    '**/*.spec.ts',
    '**/*.spec.js',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/__generated__/**',
    '**/.filer/**',
  ]),

  module_boundaries: z.object({
    strategy:  z.enum(['directory', 'package_manifest', 'explicit']).default('directory'),
    max_depth: z.number().int().min(1).max(10).default(3),
    manifests: z.array(z.string()).default(['package.json', 'pyproject.toml', 'go.mod']),
  }).default({}),

  node_types: z.object({
    constraint:   NodeTypeConfigSchema.default({}),
    danger:       NodeTypeConfigSchema.default({}),
    assumption:   NodeTypeConfigSchema.default({}),
    pattern:      NodeTypeConfigSchema.default({}),
    intent:       NodeTypeConfigSchema.default({}),
    decision:     NodeTypeConfigSchema.default({}),
    security:     NodeTypeConfigSchema.extend({
      require_verification: z.boolean().default(true),
      min_confidence: z.number().default(0.90),
    }).default({}),
    antipattern:  NodeTypeConfigSchema.default({}),
  }).default({}),

  auto_update:      z.boolean().default(true),
  stale_threshold:  z.number().min(0).max(1).default(0.7),
});

export type FilerConfig = z.infer<typeof FilerConfigSchema>;
