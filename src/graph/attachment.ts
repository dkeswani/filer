import { minimatch } from 'minimatch';
import type { AnyNode } from '../schema/nodes.js';
import type { ASTNode, ASTGraph, GovernsEdge } from './types.js';

// ── Governs-edge attachment ───────────────────────────────────────────────────
//
// For each semantic node (AnyNode from .filer/) we emit a GovernsEdge to every
// AST node whose source_file matches any of the semantic node's scope globs.
// Only file-level and function/class/method/interface AST nodes are targeted.

const GOVERNABLE_KINDS = new Set(['file', 'function', 'method', 'class', 'interface']);

export interface AttachResult {
  edges: GovernsEdge[];
  stats: {
    semantic_nodes: number;
    governs_edges:  number;
  };
}

export function attachGoverns(
  semanticNodes: AnyNode[],
  astGraph:      ASTGraph,
): AttachResult {
  const edges: GovernsEdge[] = [];

  const governable = astGraph.nodes.filter(n => GOVERNABLE_KINDS.has(n.kind));

  for (const sem of semanticNodes) {
    const scopes = sem.scope ?? [];
    if (scopes.length === 0) continue;

    for (const astNode of governable) {
      if (matchesAnyScope(astNode, scopes)) {
        edges.push({
          source:     sem.id,
          target:     astNode.id,
          relation:   'governs',
          confidence: 'EXTRACTED',
        });
      }
    }
  }

  return {
    edges,
    stats: {
      semantic_nodes: semanticNodes.length,
      governs_edges:  edges.length,
    },
  };
}

// ── Scope matching ────────────────────────────────────────────────────────────

function matchesAnyScope(astNode: ASTNode, scopes: string[]): boolean {
  for (const scope of scopes) {
    if (matchesScope(astNode.source_file, scope)) return true;
  }
  return false;
}

function matchesScope(sourceFile: string, scope: string): boolean {
  // Exact file match
  if (sourceFile === scope) return true;

  // Directory prefix: "src/auth/" matches "src/auth/validate.ts"
  if (scope.endsWith('/') && sourceFile.startsWith(scope)) return true;

  // Glob match
  if (minimatch(sourceFile, scope, { matchBase: false })) return true;

  // Allow scope without trailing slash to act as directory prefix
  if (!scope.includes('*') && !scope.includes('.') && sourceFile.startsWith(scope + '/')) return true;

  return false;
}
