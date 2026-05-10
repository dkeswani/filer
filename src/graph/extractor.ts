import Parser      from 'web-tree-sitter';
import path        from 'path';
import fs          from 'fs';
import crypto      from 'crypto';
import { createRequire } from 'module';
import { glob }    from 'glob';
import type { FilerConfig } from '../schema/index.js';
import type { ASTNode, ASTEdge, ASTGraph } from './types.js';

// ── Tree-sitter bootstrap (mirrors smart-compress.ts) ────────────────────────

const require  = createRequire(import.meta.url);
const wasmDir  = path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out');

const LANG_WASM: Record<string, string> = {
  ts:  'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  js:  'tree-sitter-javascript.wasm',
  jsx: 'tree-sitter-javascript.wasm',
  mjs: 'tree-sitter-javascript.wasm',
  cjs: 'tree-sitter-javascript.wasm',
  py:  'tree-sitter-python.wasm',
};

const EXT_LANG: Record<string, ASTNode['language']> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python',
};

let parserReady = false;
const langCache = new Map<string, Parser.Language>();

async function ensureInit() {
  if (parserReady) return;
  await Parser.init();
  parserReady = true;
}

async function getLanguage(ext: string): Promise<Parser.Language | null> {
  const wasm = LANG_WASM[ext.toLowerCase()];
  if (!wasm) return null;
  if (langCache.has(wasm)) return langCache.get(wasm)!;
  try {
    const lang = await Parser.Language.load(path.join(wasmDir, wasm));
    langCache.set(wasm, lang);
    return lang;
  } catch {
    return null;
  }
}

// ── Incremental cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  sha256:  string;
  nodes:   ASTNode[];
  edges:   ASTEdge[];
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function cacheDir(repoRoot: string): string {
  return path.join(repoRoot, '.filer', 'cache', 'ast');
}

function cacheFile(repoRoot: string, relPath: string): string {
  const safe = relPath.replace(/[/\\:]/g, '__');
  return path.join(cacheDir(repoRoot), `${safe}.json`);
}

function readCache(repoRoot: string, relPath: string): CacheEntry | null {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(repoRoot, relPath), 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(repoRoot: string, relPath: string, entry: CacheEntry): void {
  try {
    fs.mkdirSync(cacheDir(repoRoot), { recursive: true });
    fs.writeFileSync(cacheFile(repoRoot, relPath), JSON.stringify(entry));
  } catch {
    // cache write failure is non-fatal
  }
}

// ── AST parsing ───────────────────────────────────────────────────────────────

function relPath(absPath: string, root: string): string {
  return path.relative(root, absPath).replace(/\\/g, '/');
}

function nodeId(rel: string, line: number, name: string): string {
  return `ast:${rel}:${line}:${name}`;
}

function fileNodeId(rel: string): string {
  return `ast:${rel}:0:file`;
}

interface ParseResult {
  nodes: ASTNode[];
  edges: ASTEdge[];
}

function parseTree(
  tree:     Parser.Tree,
  rel:      string,
  language: ASTNode['language'],
): ParseResult {
  const nodes: ASTNode[] = [];
  const edges: ASTEdge[] = [];
  const fileId = fileNodeId(rel);

  // file node
  nodes.push({ id: fileId, kind: 'file', name: rel, source_file: rel, line: 0, language, exported: false });

  const walk = (node: Parser.SyntaxNode, parentId: string) => {
    const type = node.type;

    // ── TypeScript / JavaScript ───────────────────────────────────────────────
    if (language === 'typescript' || language === 'javascript') {
      // function / arrow function declarations
      if (type === 'function_declaration' || type === 'function') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name  = nameNode.text;
          const line  = node.startPosition.row + 1;
          const id    = nodeId(rel, line, name);
          const exported = isExported(node);
          nodes.push({ id, kind: 'function', name, source_file: rel, line, language, exported });
          edges.push({ source: parentId, target: id, relation: 'contains', confidence: 'EXTRACTED' });
          walkChildren(node, id);
          return;
        }
      }

      // method definitions (inside class body)
      if (type === 'method_definition' || type === 'method_signature') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = nameNode.text;
          const line = node.startPosition.row + 1;
          const id   = nodeId(rel, line, name);
          nodes.push({ id, kind: 'method', name, source_file: rel, line, language, exported: false });
          edges.push({ source: parentId, target: id, relation: 'contains', confidence: 'EXTRACTED' });
          walkChildren(node, id);
          return;
        }
      }

      // class declarations
      if (type === 'class_declaration' || type === 'abstract_class_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name  = nameNode.text;
          const line  = node.startPosition.row + 1;
          const id    = nodeId(rel, line, name);
          const exported = isExported(node);
          nodes.push({ id, kind: 'class', name, source_file: rel, line, language, exported });
          edges.push({ source: parentId, target: id, relation: 'contains', confidence: 'EXTRACTED' });
          walkChildren(node, id);
          return;
        }
      }

      // interface / type alias declarations (TypeScript)
      if (type === 'interface_declaration' || type === 'type_alias_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name  = nameNode.text;
          const line  = node.startPosition.row + 1;
          const id    = nodeId(rel, line, name);
          const exported = isExported(node);
          nodes.push({ id, kind: 'interface', name, source_file: rel, line, language, exported });
          edges.push({ source: parentId, target: id, relation: 'contains', confidence: 'EXTRACTED' });
          walkChildren(node, id);
          return;
        }
      }

      // import statements
      if (type === 'import_statement') {
        const src = node.childForFieldName('source');
        if (src) {
          const rawSpec = src.text.replace(/['"]/g, '');
          const isExternal = !rawSpec.startsWith('.') && !rawSpec.startsWith('/');
          edges.push({
            source:     fileId,
            target:     isExternal ? rawSpec : rawSpec,
            relation:   isExternal ? 'imports:external' : 'imports',
            confidence: 'EXTRACTED',
          });
        }
        return; // don't descend into import nodes
      }

      // export statements
      if (type === 'export_statement') {
        const src = node.childForFieldName('source');
        if (src) {
          const rawSpec = src.text.replace(/['"]/g, '');
          edges.push({ source: fileId, target: rawSpec, relation: 'exports', confidence: 'EXTRACTED' });
        }
        walkChildren(node, parentId);
        return;
      }
    }

    // ── Python ────────────────────────────────────────────────────────────────
    if (language === 'python') {
      if (type === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = nameNode.text;
          const line = node.startPosition.row + 1;
          const id   = nodeId(rel, line, name);
          nodes.push({ id, kind: 'function', name, source_file: rel, line, language, exported: true });
          edges.push({ source: parentId, target: id, relation: 'contains', confidence: 'EXTRACTED' });
          walkChildren(node, id);
          return;
        }
      }

      if (type === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = nameNode.text;
          const line = node.startPosition.row + 1;
          const id   = nodeId(rel, line, name);
          nodes.push({ id, kind: 'class', name, source_file: rel, line, language, exported: true });
          edges.push({ source: parentId, target: id, relation: 'contains', confidence: 'EXTRACTED' });
          walkChildren(node, id);
          return;
        }
      }

      if (type === 'import_statement' || type === 'import_from_statement') {
        const moduleNode = node.childForFieldName('module_name') ?? node.childForFieldName('name');
        if (moduleNode) {
          const rawSpec = moduleNode.text;
          const isExternal = !rawSpec.startsWith('.');
          edges.push({
            source:     fileId,
            target:     rawSpec,
            relation:   isExternal ? 'imports:external' : 'imports',
            confidence: 'EXTRACTED',
          });
        }
        return;
      }
    }

    walkChildren(node, parentId);
  };

  const walkChildren = (node: Parser.SyntaxNode, parentId: string) => {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, parentId);
    }
  };

  walkChildren(tree.rootNode, fileId);
  return { nodes, edges };
}

// Check if a TS/JS syntax node is directly inside an export_statement
function isExported(node: Parser.SyntaxNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  return parent.type === 'export_statement';
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function extractAST(
  repoRoot:  string,
  config:    FilerConfig,
  options?:  { incremental?: boolean },
): Promise<ASTGraph> {
  await ensureInit();

  const incremental = options?.incremental ?? true;
  const include     = config.include ?? ['src/**'];
  const exclude     = config.exclude ?? [];

  // Collect files
  const files: string[] = [];
  for (const pattern of include) {
    const matches = await glob(pattern, {
      cwd:    repoRoot,
      ignore: [...exclude, '**/node_modules/**', '**/.filer/**', '**/dist/**'],
      absolute: true,
      nodir:    true,
    });
    files.push(...matches);
  }

  const seen = new Set<string>();
  const uniqueFiles = files.filter(f => {
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });

  const allNodes: ASTNode[] = [];
  const allEdges: ASTEdge[] = [];
  const parseErrors: Array<{ path: string; error: string }> = [];
  let filesParsed  = 0;
  let filesSkipped = 0;

  for (const absFile of uniqueFiles) {
    const ext  = path.extname(absFile).slice(1).toLowerCase();
    const lang = EXT_LANG[ext];
    if (!lang) { filesSkipped++; continue; }

    const language = await getLanguage(ext);
    if (!language) { filesSkipped++; continue; }

    const rel = relPath(absFile, repoRoot);
    let content: string;
    try {
      content = fs.readFileSync(absFile, 'utf8');
    } catch (e) {
      parseErrors.push({ path: rel, error: String(e) });
      filesSkipped++;
      continue;
    }

    const hash = sha256(content);

    // Try incremental cache
    if (incremental) {
      const cached = readCache(repoRoot, rel);
      if (cached?.sha256 === hash) {
        allNodes.push(...cached.nodes);
        allEdges.push(...cached.edges);
        filesParsed++;
        continue;
      }
    }

    // Parse
    try {
      const parser = new Parser();
      parser.setLanguage(language);
      const tree   = parser.parse(content);
      const result = parseTree(tree, rel, lang);
      allNodes.push(...result.nodes);
      allEdges.push(...result.edges);
      if (incremental) writeCache(repoRoot, rel, { sha256: hash, nodes: result.nodes, edges: result.edges });
      filesParsed++;
    } catch (e) {
      parseErrors.push({ path: rel, error: String(e) });
      filesSkipped++;
    }
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    stats: {
      files_scanned:  uniqueFiles.length,
      files_parsed:   filesParsed,
      files_skipped:  filesSkipped,
      parse_errors:   parseErrors,
    },
  };
}
