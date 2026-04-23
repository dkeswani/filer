import fs   from 'fs';
import path from 'path';
import { glob } from 'glob';
import type { FilerConfig } from '../schema/mod.js';

export interface SourceFile {
  path:         string;   // relative to repo root
  absolutePath: string;
  content:      string;
  sizeBytes:    number;
  mtimeMs:      number;   // file last-modified timestamp (ms since epoch)
  chunkInfo?:   { index: number; total: number };  // present when file was split into chunks
}

export interface Module {
  path:    string;          // module directory path relative to root
  name:    string;          // human-readable module name
  files:   SourceFile[];
  tokens:  number;          // estimated token count
}

// ── File size limits ──────────────────────────────────────────────────────────

const MAX_FILE_BYTES      = 500_000;   // 500KB — skip files larger than this (large files are chunked instead)
const MAX_MODULE_TOKENS   = 20_000;    // split modules that exceed this
export const CHUNK_LINE_THRESHOLD = 2000;  // files over this many lines are split into chunks
const CHUNK_TARGET_LINES  = 1800;      // target lines per chunk

// ── Scan repository for source files ─────────────────────────────────────────

export async function scanFiles(
  root:   string,
  config: FilerConfig
): Promise<SourceFile[]> {
  const files: SourceFile[] = [];

  for (const pattern of config.include) {
    const matches = await glob(pattern, {
      cwd:    root,
      ignore: config.exclude,
      nodir:  true,
    });

    for (const rel of matches) {
      const abs = path.join(root, rel);

      // Skip binary files by extension
      if (isBinary(rel)) continue;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }

      if (stat.size > MAX_FILE_BYTES) continue;

      let content: string;
      try {
        content = fs.readFileSync(abs, 'utf-8');
      } catch {
        continue;
      }

      const baseFile: SourceFile = {
        path:         rel,
        absolutePath: abs,
        content,
        sizeBytes:    stat.size,
        mtimeMs:      stat.mtimeMs,
      };

      const chunks = chunkLargeFile(baseFile);
      files.push(...chunks);
    }
  }

  return files;
}

// ── Group files into modules ──────────────────────────────────────────────────

export function groupIntoModules(
  files:  SourceFile[],
  config: FilerConfig
): Module[] {
  const { strategy, max_depth, manifests } = config.module_boundaries;

  if (strategy === 'package_manifest') {
    return groupByManifest(files, manifests);
  }

  // Default: directory-based grouping up to max_depth
  return groupByDirectory(files, max_depth);
}

function groupByDirectory(files: SourceFile[], maxDepth: number): Module[] {
  const moduleMap = new Map<string, SourceFile[]>();

  for (const file of files) {
    const parts  = file.path.split('/');
    const depth  = Math.min(parts.length - 1, maxDepth);
    const modPath = parts.slice(0, depth).join('/') || '.';

    if (!moduleMap.has(modPath)) moduleMap.set(modPath, []);
    moduleMap.get(modPath)!.push(file);
  }

  const modules: Module[] = [];

  for (const [modPath, modFiles] of moduleMap) {
    const tokens = estimateTokens(modFiles);

    // Split large modules
    if (tokens > MAX_MODULE_TOKENS && modFiles.length > 1) {
      const chunks = splitModule(modPath, modFiles);
      modules.push(...chunks);
    } else {
      modules.push({
        path:  modPath,
        name:  modPath.split('/').pop() ?? modPath,
        files: modFiles,
        tokens,
      });
    }
  }

  // Sort by path for deterministic ordering
  return modules.sort((a, b) => a.path.localeCompare(b.path));
}

function groupByManifest(files: SourceFile[], manifests: string[]): Module[] {
  // Find manifest files to determine package boundaries
  const manifestFiles = files.filter(f =>
    manifests.some(m => f.path.endsWith(m))
  );

  if (manifestFiles.length === 0) {
    // Fall back to directory grouping
    return groupByDirectory(files, 3);
  }

  const modules: Module[] = [];
  const assigned = new Set<string>();

  for (const manifest of manifestFiles) {
    const pkgRoot = path.dirname(manifest.path);
    const pkgFiles = files.filter(f =>
      f.path.startsWith(pkgRoot + '/') && !assigned.has(f.path)
    );

    for (const f of pkgFiles) assigned.add(f.path);

    if (pkgFiles.length > 0) {
      modules.push({
        path:   pkgRoot,
        name:   pkgRoot.split('/').pop() ?? pkgRoot,
        files:  pkgFiles,
        tokens: estimateTokens(pkgFiles),
      });
    }
  }

  // Remaining unassigned files
  const remaining = files.filter(f => !assigned.has(f.path));
  if (remaining.length > 0) {
    const grouped = groupByDirectory(remaining, 3);
    modules.push(...grouped);
  }

  return modules.sort((a, b) => a.path.localeCompare(b.path));
}

// ── Split an oversized module into smaller chunks ─────────────────────────────

function splitModule(modPath: string, files: SourceFile[]): Module[] {
  const chunks: Module[] = [];
  let current: SourceFile[] = [];
  let currentTokens = 0;

  for (const file of files) {
    const fileTokens = estimateTokens([file]);

    if (currentTokens + fileTokens > MAX_MODULE_TOKENS && current.length > 0) {
      chunks.push({
        path:   modPath,
        name:   `${modPath.split('/').pop() ?? modPath} (part ${chunks.length + 1})`,
        files:  current,
        tokens: currentTokens,
      });
      current = [];
      currentTokens = 0;
    }

    current.push(file);
    currentTokens += fileTokens;
  }

  if (current.length > 0) {
    chunks.push({
      path:   modPath,
      name:   `${modPath.split('/').pop() ?? modPath}${chunks.length > 0 ? ` (part ${chunks.length + 1})` : ''}`,
      files:  current,
      tokens: currentTokens,
    });
  }

  return chunks;
}

// ── Large file chunking ───────────────────────────────────────────────────────

// Matches top-level symbol declarations at column 0 (no leading whitespace)
const SYMBOL_BOUNDARY_RE = /^(export\s|module\.exports|function[\s*]\s*\w|async\s+function\s+\w|class\s+\w|def\s+\w|async\s+def\s+\w|func\s+\w)/;

export function chunkLargeFile(file: SourceFile): SourceFile[] {
  const lines = file.content.split('\n');
  if (lines.length <= CHUNK_LINE_THRESHOLD) return [file];

  // Collect top-level symbol boundary line indices
  const boundaries: number[] = [0];
  for (let i = 1; i < lines.length; i++) {
    if (SYMBOL_BOUNDARY_RE.test(lines[i])) {
      boundaries.push(i);
    }
  }

  // Group boundaries into chunks targeting CHUNK_TARGET_LINES each
  const chunkRanges: Array<{ start: number; end: number }> = [];
  let chunkStart = 0;

  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] - chunkStart >= CHUNK_TARGET_LINES) {
      chunkRanges.push({ start: chunkStart, end: boundaries[i] });
      chunkStart = boundaries[i];
    }
  }
  chunkRanges.push({ start: chunkStart, end: lines.length });

  if (chunkRanges.length === 1) {
    // Everything fit in one chunk (few or no export boundaries) — no chunkInfo needed
    return [file];
  }

  const total = chunkRanges.length;
  return chunkRanges.map((range, idx) => {
    const chunkContent = lines.slice(range.start, range.end).join('\n');
    return {
      path:         file.path,
      absolutePath: file.absolutePath,
      content:      chunkContent,
      sizeBytes:    chunkContent.length,
      mtimeMs:      file.mtimeMs,
      chunkInfo:    { index: idx + 1, total },
    };
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateTokens(files: SourceFile[]): number {
  const chars = files.reduce((s, f) => s + f.content.length, 0);
  return Math.ceil(chars / 4);
}

function isBinary(filePath: string): boolean {
  const binaryExts = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    '.pdf', '.zip', '.tar', '.gz', '.wasm',
    '.ttf', '.woff', '.woff2', '.eot',
    '.mp4', '.mp3', '.wav', '.ogg',
    '.exe', '.dll', '.so', '.dylib',
    '.lock',  // package lock files — too noisy, not useful for extraction
  ]);
  return binaryExts.has(path.extname(filePath).toLowerCase());
}

// ── Get files changed since a git commit ─────────────────────────────────────

import { execSync } from 'child_process';

export function getChangedFiles(root: string, since: string = 'HEAD~1'): string[] {
  try {
    const output = execSync(
      `git diff --name-only ${since}..HEAD`,
      { cwd: root, stdio: 'pipe' }
    ).toString().trim();

    return output.length > 0 ? output.split('\n') : [];
  } catch {
    return [];
  }
}

export function getCurrentCommit(root: string): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, stdio: 'pipe' })
      .toString().trim();
  } catch {
    return undefined;
  }
}

// Patterns that indicate a commit was authored by an AI agent
const AGENT_COMMIT_PATTERNS = [
  /co-authored-by:.*claude/i,
  /co-authored-by:.*copilot/i,
  /co-authored-by:.*chatgpt/i,
  /co-authored-by:.*gpt-/i,
  /🤖\s*generated with/i,
  /generated with \[claude/i,
  /generated with claude/i,
];

export function isAgentCommit(root: string, ref = 'HEAD'): boolean {
  try {
    const msg = execSync(`git log -1 --format=%B ${ref}`, { cwd: root, stdio: 'pipe' }).toString();
    return AGENT_COMMIT_PATTERNS.some(re => re.test(msg));
  } catch {
    return false;
  }
}
