// ── AST node kinds emitted by the extractor ──────────────────────────────────

export type ASTNodeKind =
  | 'file'
  | 'module'
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'export';

export type ASTEdgeKind =
  | 'contains'
  | 'imports'
  | 'imports:external'
  | 'exports';

// ── Graph edge confidence vocabulary (EXTRACTED = deterministic glob/AST) ─────

export type EdgeConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

// ── Core structural types ─────────────────────────────────────────────────────

export interface ASTNode {
  id:          string;        // ast:<relative-path>:<line>:<name>
  kind:        ASTNodeKind;
  name:        string;
  source_file: string;        // relative path from repo root, forward slashes
  line:        number;
  language:    'typescript' | 'javascript' | 'python' | 'unknown';
  exported:    boolean;
}

export interface ASTEdge {
  source:     string;         // ASTNode id or typed node id
  target:     string;
  relation:   ASTEdgeKind;
  confidence: EdgeConfidence;
}

export interface GovernsEdge {
  source:     string;         // typed node id e.g. "security:never-log-secrets"
  target:     string;         // AST node id
  relation:   'governs';
  confidence: EdgeConfidence;
}

export interface TypedEdge {
  source:   string;
  target:   string;
  relation: 'RELATED' | 'SUPERSEDES' | 'MUST_NOT_MODIFY_WITH';
}

// ── Full graph output ─────────────────────────────────────────────────────────

export interface ASTGraph {
  nodes: ASTNode[];
  edges: ASTEdge[];
  stats: {
    files_scanned:  number;
    files_parsed:   number;
    files_skipped:  number;
    parse_errors:   Array<{ path: string; error: string }>;
  };
}

export interface GraphOutput {
  filer_version:    string;
  graph_version:    string;
  indexed_at:       string;
  origin_repo:      string;
  stats: {
    structural_nodes: number;
    structural_edges: number;
    semantic_nodes:   number;
    governs_edges:    number;
    inter_typed_edges: number;
    files_parsed:     number;
    files_skipped:    number;
    languages:        Record<string, number>;
  };
  nodes: Array<ASTNode | Record<string, unknown>>;
  edges: Array<ASTEdge | GovernsEdge | TypedEdge>;
}
