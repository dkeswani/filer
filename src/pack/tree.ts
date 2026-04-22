import fs   from 'fs';
import path from 'path';

export interface TreeNode {
  name:     string;
  path:     string;
  type:     'file' | 'dir';
  size?:    number;
  tokens?:  number;
  children?: TreeNode[];
}

export function buildTree(
  dir: string,
  root: string,
  opts: { showSize?: boolean; showTokens?: boolean; maxDepth?: number; depth?: number } = {}
): TreeNode {
  const depth     = opts.depth ?? 0;
  const maxDepth  = opts.maxDepth ?? 99;
  const rel       = path.relative(root, dir) || '.';
  const stat      = fs.statSync(dir);

  const node: TreeNode = {
    name: path.basename(dir) || rel,
    path: rel,
    type: 'dir',
  };

  if (depth >= maxDepth) return node;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  node.children = [];

  for (const entry of entries.sort((a, b) => {
    // dirs first, then files, both alpha
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  })) {
    const childPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      node.children.push(buildTree(childPath, root, { ...opts, depth: depth + 1 }));
    } else if (entry.isFile()) {
      const childStat = fs.statSync(childPath);
      node.children.push({
        name:   entry.name,
        path:   path.relative(root, childPath),
        type:   'file',
        size:   opts.showSize ? childStat.size : undefined,
      });
    }
  }

  return node;
}

export function renderTree(
  node: TreeNode,
  prefix = '',
  isLast = true,
  isRoot = true
): string {
  const lines: string[] = [];
  const connector = isRoot ? '' : (isLast ? '└── ' : '├── ');
  const sizeStr   = node.size != null ? `  (${formatBytes(node.size)})` : '';
  const tokStr    = node.tokens != null ? `  ~${node.tokens.toLocaleString()} tokens` : '';

  lines.push(`${prefix}${connector}${node.name}${sizeStr}${tokStr}`);

  if (node.children) {
    const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
    node.children.forEach((child, i) => {
      const last = i === node.children!.length - 1;
      lines.push(renderTree(child, childPrefix, last, false));
    });
  }

  return lines.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)       return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
