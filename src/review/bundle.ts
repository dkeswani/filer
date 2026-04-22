import fs   from 'fs';
import path from 'path';
import { AnyNode, NODE_PRIORITY } from '../schema/mod.js';
import { readAllNodes, writeNode, filerDir } from '../store/mod.js';
import { SEVERITY_MAP } from '../report/generator.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'amended';

export interface ReviewItem {
  id:              string;
  type:            AnyNode['type'];
  severity:        string;
  status:          ReviewStatus;
  node:            AnyNode;
  confidence:      number;
  requires_human:  boolean;
  review_comment:  string | null;
}

export interface ReviewBundle {
  generated_at:  string;
  repo:          string;
  review_items:  ReviewItem[];
}

export interface ApplyDecision {
  id:             string;
  status:         ReviewStatus;
  review_comment?: string;
}

export interface ApplyResult {
  applied:  number;
  rejected: number;
  skipped:  number;
}

// ── Paths ─────────────────────────────────────────────────────────────────────

export const REVIEW_DIR     = '.filer/review';
export const PENDING_FILE   = '.filer/review/pending.json';

// ── Generate a review bundle from current nodes ───────────────────────────────

export function generateBundle(root: string, opts: {
  type?:          string;
  unverifiedOnly?: boolean;
  stale?:          boolean;
} = {}): ReviewBundle {
  let nodes = readAllNodes(root);

  if (opts.type) {
    const types = opts.type.split(',').map(t => t.trim()) as AnyNode['type'][];
    nodes = nodes.filter(n => types.includes(n.type));
  }
  if (opts.unverifiedOnly) {
    nodes = nodes.filter(n => !n.verified);
  }
  if (opts.stale) {
    nodes = nodes.filter(n => n.stale_risk >= 0.5);
  }

  nodes.sort((a, b) => (NODE_PRIORITY[a.type] ?? 9) - (NODE_PRIORITY[b.type] ?? 9));

  const items: ReviewItem[] = nodes.map(node => ({
    id:             node.id,
    type:           node.type,
    severity:       SEVERITY_MAP[node.type].label,
    status:         'pending' as ReviewStatus,
    node,
    confidence:     node.confidence,
    requires_human: node.type === 'security',
    review_comment: null,
  }));

  return {
    generated_at: new Date().toISOString(),
    repo:         path.basename(root),
    review_items: items,
  };
}

// ── Write pending.json ────────────────────────────────────────────────────────

export function writeBundle(root: string, bundle: ReviewBundle): string {
  const dir = path.join(root, REVIEW_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(root, PENDING_FILE);
  fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8');
  return filePath;
}

// ── Read pending.json ─────────────────────────────────────────────────────────

export function readBundle(root: string): ReviewBundle | null {
  const filePath = path.join(root, PENDING_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ReviewBundle;
  } catch {
    return null;
  }
}

// ── Apply decisions from a reviewed bundle ────────────────────────────────────

export function applyDecisions(root: string, decisions: ApplyDecision[]): ApplyResult {
  const bundle = readBundle(root);
  const result: ApplyResult = { applied: 0, rejected: 0, skipped: 0 };

  for (const decision of decisions) {
    if (decision.status === 'pending') { result.skipped++; continue; }

    const item = bundle?.review_items.find(i => i.id === decision.id);
    if (!item) { result.skipped++; continue; }

    if (decision.status === 'approved' || decision.status === 'amended') {
      writeNode(root, { ...item.node, verified: true, stale_risk: 0 });
      result.applied++;
    } else if (decision.status === 'rejected') {
      writeNode(root, { ...item.node, verified: false, stale_risk: 1.0 });
      result.rejected++;
    }

    // Update status in bundle
    item.status         = decision.status;
    item.review_comment = decision.review_comment ?? null;
  }

  // Persist updated statuses
  if (bundle) writeBundle(root, bundle);

  return result;
}
