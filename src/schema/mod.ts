export * from './nodes.js';
export * from './index.js';

import { execSync } from 'child_process';
import path from 'path';

export const FILER_VERSION = '1.0';
export const FILER_DIR = '.filer';
export const FILER_INDEX = '.filer/index.json';
export const FILER_CONFIG = '.filer/.filer-config.json';
export const FILER_GRAPH = '.filer/graph.json';
export const FILER_GRAPH_VERSION = '1.0';

/** Resolve `origin_repo` for a given repo root. Returns normalized
 *  `host/owner/repo` from the git remote, or the directory basename. */
export function resolveOriginRepo(root: string): string {
  try {
    const raw = execSync('git remote get-url origin', { cwd: root, stdio: 'pipe' })
      .toString().trim();
    // Normalize SSH and HTTPS git URLs to host/owner/repo
    // git@github.com:owner/repo.git  →  github.com/owner/repo
    // https://github.com/owner/repo  →  github.com/owner/repo
    const ssh = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (ssh) return `${ssh[1]}/${ssh[2]}`;
    const https = raw.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (https) return `${https[1]}/${https[2]}`;
    return path.basename(root);
  } catch {
    return path.basename(root);
  }
}
