import Parser from 'web-tree-sitter';
import path   from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const wasmDir = path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out');

const LANG_MAP: Record<string, string> = {
  ts:   'tree-sitter-typescript.wasm',
  tsx:  'tree-sitter-tsx.wasm',
  js:   'tree-sitter-javascript.wasm',
  jsx:  'tree-sitter-javascript.wasm',
  mjs:  'tree-sitter-javascript.wasm',
  cjs:  'tree-sitter-javascript.wasm',
  py:   'tree-sitter-python.wasm',
  go:   'tree-sitter-go.wasm',
  rs:   'tree-sitter-rust.wasm',
  java: 'tree-sitter-java.wasm',
  c:    'tree-sitter-c.wasm',
  h:    'tree-sitter-c.wasm',
  cpp:  'tree-sitter-cpp.wasm',
  cc:   'tree-sitter-cpp.wasm',
  rb:   'tree-sitter-ruby.wasm',
  cs:   'tree-sitter-c_sharp.wasm',
  css:  'tree-sitter-css.wasm',
  sh:   'tree-sitter-bash.wasm',
  bash: 'tree-sitter-bash.wasm',
};

const COMMENT_TYPES = new Set([
  'comment', 'line_comment', 'block_comment', 'multiline_comment',
]);

let ready = false;
const langCache = new Map<string, Parser.Language>();

async function ensureInit() {
  if (ready) return;
  await Parser.init();
  ready = true;
}

async function getLanguage(ext: string): Promise<Parser.Language | null> {
  const wasm = LANG_MAP[ext.toLowerCase()];
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

export interface SmartCompressResult {
  content:         string;
  originalBytes:   number;
  compressedBytes: number;
  supported:       boolean;
}

export async function smartCompress(filePath: string, content: string): Promise<SmartCompressResult> {
  const originalBytes = Buffer.byteLength(content);
  const ext = path.extname(filePath).slice(1).toLowerCase();

  await ensureInit();
  const language = await getLanguage(ext);

  if (!language) {
    const compressed = collapseBlankLines(content);
    return { content: compressed, originalBytes, compressedBytes: Buffer.byteLength(compressed), supported: false };
  }

  const parser = new Parser();
  parser.setLanguage(language);

  let tree: Parser.Tree | null = null;
  try {
    tree = parser.parse(content);
  } catch {
    return { content, originalBytes, compressedBytes: originalBytes, supported: false };
  }
  if (!tree) return { content, originalBytes, compressedBytes: originalBytes, supported: false };

  const ranges: { start: number; end: number }[] = [];
  collectComments(tree.rootNode, ranges);
  ranges.sort((a, b) => b.start - a.start);

  let result = content;
  for (const { start, end } of ranges) {
    const after = result[end] === '\n' ? '\n' : '';
    result = result.slice(0, start) + after + result.slice(end);
  }

  result = collapseBlankLines(result);

  return {
    content:         result,
    originalBytes,
    compressedBytes: Buffer.byteLength(result),
    supported:       true,
  };
}

function collectComments(node: Parser.SyntaxNode, out: { start: number; end: number }[]) {
  if (COMMENT_TYPES.has(node.type)) {
    out.push({ start: node.startIndex, end: node.endIndex });
    return;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) collectComments(child, out);
  }
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
