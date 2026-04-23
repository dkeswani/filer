// Shared utilities used across all commands

import chalk from 'chalk';
import { filerExists, readAllNodes, readConfig } from '../store/mod.js';
import { AnyNode, NodeType, NODE_PRIORITY, type FilerConfig } from '../schema/mod.js';

// ── Guard helpers ─────────────────────────────────────────────────────────────

export function ensureFilerExists(root: string): void {
  if (!filerExists(root)) {
    console.error(chalk.red('\n  No .filer/ directory found. Run: filer init\n'));
    process.exit(1);
  }
}

export function ensureConfig(root: string): FilerConfig {
  ensureFilerExists(root);
  const config = readConfig(root);
  if (!config) {
    console.error(chalk.red('\n  No .filer-config.json found. Run: filer init\n'));
    process.exit(1);
  }
  return config;
}

// ── Node filtering ────────────────────────────────────────────────────────────

export interface NodeFilterOptions {
  type?:           string;   // comma-separated node types
  scope?:          string;   // path prefix
  verified?:       boolean;
  stale?:          boolean;  // stale_risk >= 0.5
  unverifiedOnly?: boolean;  // alias for verified: false
}

export function filterNodes(nodes: AnyNode[], opts: NodeFilterOptions): AnyNode[] {
  let result = nodes;

  if (opts.type) {
    const types = opts.type.split(',').map(t => t.trim()) as NodeType[];
    result = result.filter(n => types.includes(n.type));
  }

  if (opts.scope) {
    const scope = opts.scope;
    result = result.filter(n =>
      n.scope.some(s =>
        s.includes(scope) || scope.includes(s.replace('/**', '').replace('/*', ''))
      )
    );
  }

  if (opts.verified !== undefined) {
    result = result.filter(n => n.verified === opts.verified);
  }

  if (opts.unverifiedOnly) {
    result = result.filter(n => !n.verified);
  }

  if (opts.stale) {
    result = result.filter(n => n.stale_risk >= 0.5);
  }

  return result;
}

// ── Node sorting ──────────────────────────────────────────────────────────────

export function sortByPriority(nodes: AnyNode[]): AnyNode[] {
  return [...nodes].sort(
    (a, b) => (NODE_PRIORITY[a.type] ?? 9) - (NODE_PRIORITY[b.type] ?? 9)
  );
}

// ── Load, filter and sort in one call ────────────────────────────────────────

export function loadNodes(root: string, opts: NodeFilterOptions = {}): AnyNode[] {
  return sortByPriority(filterNodes(readAllNodes(root), opts));
}
