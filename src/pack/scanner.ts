import fs   from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { minimatch } from 'minimatch';

export interface PackedFile {
  path:      string;   // relative to root
  content:   string;
  size:      number;   // bytes
  tokens:    number;   // estimated
  language:  string;
  changes:   number;   // git change frequency (0 if unknown)
}

export interface ScanOptions {
  root:               string;
  include?:           string[];   // glob patterns
  ignore?:            string[];   // additional patterns
  useGitignore?:      boolean;    // default true
  maxFileSizeKb?:     number;     // default 500
  sortByChanges?:     boolean;
  includeEmptyDirs?:  boolean;
}

// Default patterns to always exclude
const DEFAULT_IGNORE = [
  '**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**',
  '**/.filer/**', '**/coverage/**', '**/__pycache__/**', '**/*.pyc',
  '**/.DS_Store', '**/Thumbs.db', '**/*.tgz', '**/*.zip',
  '**/.env', '**/.env.*', '**/package-lock.json', '**/yarn.lock',
  '**/pnpm-lock.yaml', '**/*.min.js', '**/*.min.css',
];

export async function scanFiles(opts: ScanOptions): Promise<PackedFile[]> {
  const {
    root,
    include        = ['**/*'],
    ignore         = [],
    useGitignore   = true,
    maxFileSizeKb  = 500,
    sortByChanges  = false,
  } = opts;

  const gitignorePatterns = useGitignore ? readGitignore(root) : [];
  const allIgnore = [...DEFAULT_IGNORE, ...gitignorePatterns, ...ignore];

  const changeFreq = sortByChanges ? getChangeFrequency(root) : {};

  const allFiles = walkDir(root, root);
  const maxBytes = maxFileSizeKb * 1024;

  const files: PackedFile[] = [];

  for (const absPath of allFiles) {
    const rel = path.relative(root, absPath).replace(/\\/g, '/');

    // Apply ignore patterns
    if (allIgnore.some(p => minimatch(rel, p, { dot: true }))) continue;

    // Apply include patterns
    const included = include.some(p => minimatch(rel, p, { dot: true }) || minimatch(rel, `**/${p}`, { dot: true }));
    if (!included) continue;

    const stat = fs.statSync(absPath);
    if (stat.size > maxBytes) continue;

    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch {
      continue; // skip binary files
    }

    if (isBinary(content)) continue;

    files.push({
      path:     rel,
      content,
      size:     stat.size,
      tokens:   estimateTokens(content),
      language: detectExt(rel),
      changes:  changeFreq[rel] ?? 0,
    });
  }

  if (sortByChanges) {
    files.sort((a, b) => b.changes - a.changes);
  }

  return files;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function walkDir(dir: string, root: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, root));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function readGitignore(root: string): string[] {
  const patterns: string[] = [];
  for (const name of ['.gitignore', '.ignore', '.repomixignore', '.filerignore']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        // Normalize to glob
        const pat = trimmed.endsWith('/') ? `${trimmed}**` : trimmed;
        patterns.push(pat, `**/${pat}`);
      }
    }
  }
  return patterns;
}

function getChangeFrequency(root: string): Record<string, number> {
  const freq: Record<string, number> = {};
  try {
    const out = execSync('git log --name-only --pretty=format: --no-merges -n 200', {
      cwd: root, stdio: 'pipe', maxBuffer: 2 * 1024 * 1024,
    }).toString();
    for (const line of out.split('\n')) {
      const f = line.trim();
      if (f) freq[f] = (freq[f] ?? 0) + 1;
    }
  } catch { /* not a git repo */ }
  return freq;
}

function isBinary(content: string): boolean {
  // Heuristic: if more than 0.1% of chars are null bytes or non-printable, treat as binary
  let nonPrintable = 0;
  const sample = content.slice(0, 8000);
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0 || (code < 8 && code !== 9 && code !== 10 && code !== 13)) nonPrintable++;
  }
  return nonPrintable / sample.length > 0.001;
}

export function estimateTokens(text: string): number {
  // ~4 chars per token (GPT/Claude approximation)
  return Math.ceil(text.length / 4);
}

function detectExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript',
    '.py': 'python', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.c': 'c', '.cpp': 'cpp',
    '.cs': 'csharp', '.rb': 'ruby', '.php': 'php',
    '.sh': 'shell', '.yaml': 'yaml', '.yml': 'yaml',
    '.json': 'json', '.md': 'markdown', '.html': 'html', '.css': 'css',
  };
  return map[ext] ?? ext.slice(1) ?? 'text';
}
