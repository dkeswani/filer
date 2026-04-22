import { readAllNodes, filerExists } from '../store/mod.js';
import type { AnyNode } from '../schema/mod.js';
import type { PackedFile } from './scanner.js';

// ── Load knowledge nodes relevant to a file path ──────────────────────────────

function scopeMatches(nodeScope: string, filePath: string): boolean {
  const clean = (s: string) => s.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
  const cs = clean(nodeScope);
  const cf = clean(filePath);
  return cf.startsWith(cs + '/') || cf === cs || cs.startsWith(cf + '/') || cs === cf;
}

function nodesForFile(nodes: AnyNode[], filePath: string): AnyNode[] {
  return nodes.filter(n => n.scope.some(s => scopeMatches(s, filePath)));
}

// ── Render a knowledge node as an inline annotation comment ───────────────────

function nodeToAnnotation(node: AnyNode): string {
  const ICONS: Record<string, string> = {
    security:    '🔴 SECURITY',
    constraint:  '🟡 CONSTRAINT',
    danger:      '🟠 DANGER',
    assumption:  '🔵 ASSUMPTION',
    antipattern: '🟣 ANTIPATTERN',
    pattern:     '🟢 PATTERN',
    intent:      '⚪ INTENT',
    decision:    '⚫ DECISION',
  };

  const icon    = ICONS[node.type] ?? node.type.toUpperCase();
  const conf    = Math.round(node.confidence * 100);
  const stale   = node.stale_risk >= 0.5 ? ' ⚠ STALE' : '';
  const verified = node.verified ? ' ✓' : '';

  const lines: string[] = [`[FILER ${icon}${verified}${stale}] (${conf}% conf) ${node.id}`];

  switch (node.type) {
    case 'security':
    case 'constraint':
      lines.push(`  Rule: ${node.statement}`);
      lines.push(`  If violated: ${node.if_violated}`);
      break;
    case 'danger':
      lines.push(`  Danger: ${node.statement}`);
      lines.push(`  Condition: ${node.condition}`);
      lines.push(`  Safe pattern: ${node.safe_pattern}`);
      break;
    case 'assumption':
      lines.push(`  Assumes: ${node.statement}`);
      lines.push(`  Breaks when: ${node.breaks_when}`);
      break;
    case 'antipattern':
      lines.push(`  Don't: ${node.statement}`);
      lines.push(`  Instead: ${node.correct_pattern}`);
      break;
    case 'pattern':
      lines.push(`  Pattern: ${node.statement}`);
      lines.push(`  Why: ${node.why}`);
      break;
    case 'intent':
      lines.push(`  Purpose: ${node.purpose}`);
      if (node.does_not_own.length) lines.push(`  Does NOT own: ${node.does_not_own.join(', ')}`);
      break;
    case 'decision':
      lines.push(`  Decision: ${node.statement}`);
      lines.push(`  Reason: ${node.reason}`);
      break;
  }

  return lines.join('\n');
}

export type AnnotationDepth = 'none' | 'summary' | 'full';

// ── Annotate file content with knowledge nodes ────────────────────────────────

export function annotateFile(
  file: PackedFile,
  nodes: AnyNode[],
  depth: AnnotationDepth
): string {
  if (depth === 'none') return file.content;

  const relevant = nodesForFile(nodes, file.path);
  if (relevant.length === 0) return file.content;

  // Sort: security first, then by priority
  const PRIORITY: Record<string, number> = {
    security: 0, constraint: 1, danger: 2, assumption: 3,
    antipattern: 4, pattern: 5, intent: 6, decision: 7,
  };
  relevant.sort((a, b) => (PRIORITY[a.type] ?? 9) - (PRIORITY[b.type] ?? 9));

  // In 'summary' mode only show security + constraint + danger nodes
  const toShow = depth === 'summary'
    ? relevant.filter(n => ['security', 'constraint', 'danger'].includes(n.type))
    : relevant;

  if (toShow.length === 0) return file.content;

  const annotations = toShow.map(n => `// ${nodeToAnnotation(n).replace(/\n/g, '\n// ')}`).join('\n//\n');
  const header = [
    `// ═══════════════════════════════════════════════════`,
    `// FILER KNOWLEDGE — ${file.path}`,
    `// ${toShow.length} node(s) — read before modifying`,
    `// ═══════════════════════════════════════════════════`,
    annotations,
    `// ═══════════════════════════════════════════════════`,
    '',
  ].join('\n');

  return header + file.content;
}

// ── Build a repo-level knowledge preamble ────────────────────────────────────

export function buildKnowledgePreamble(root: string, files: PackedFile[]): string {
  if (!filerExists(root)) return '';

  const allNodes   = readAllNodes(root);
  const filePaths  = files.map(f => f.path);
  const relevant   = allNodes.filter(n =>
    n.scope.some(s => filePaths.some(fp => scopeMatches(s, fp)))
  );

  if (relevant.length === 0) return '';

  const security    = relevant.filter(n => n.type === 'security');
  const constraints = relevant.filter(n => n.type === 'constraint');
  const dangers     = relevant.filter(n => n.type === 'danger');
  const stale       = relevant.filter(n => n.stale_risk >= 0.5);

  const lines: string[] = [
    '# Filer Knowledge Summary',
    '',
    `${relevant.length} knowledge node(s) covering ${files.length} file(s).`,
    '',
  ];

  if (stale.length > 0) {
    lines.push(`> ⚠ ${stale.length} node(s) may be stale. Run \`filer update --check-stale\` to refresh.`);
    lines.push('');
  }

  if (security.length > 0) {
    lines.push('## 🔴 Security Rules (read first)');
    for (const n of security) {
      lines.push(`- **${n.id}**: ${n.statement} — *If violated: ${n.if_violated}*`);
    }
    lines.push('');
  }

  if (constraints.length > 0) {
    lines.push('## 🟡 Constraints');
    for (const n of constraints) {
      lines.push(`- **${n.id}**: ${n.statement}`);
    }
    lines.push('');
  }

  if (dangers.length > 0) {
    lines.push('## 🟠 Dangers');
    for (const n of dangers) {
      lines.push(`- **${n.id}**: ${n.statement} — *condition: ${n.condition}*`);
    }
    lines.push('');
  }

  lines.push('---', '');
  return lines.join('\n');
}

export { nodesForFile, readAllNodes };
