import { execSync } from 'child_process';
import fs   from 'fs';
import path from 'path';
import os   from 'os';

// ── Clone a remote repo to a temp directory ───────────────────────────────────
// Returns the temp dir path. Caller must call cleanup() when done.

export interface RemoteRepo {
  root:    string;
  cleanup: () => void;
}

export async function cloneRemote(repoUrl: string, branch?: string): Promise<RemoteRepo> {
  const normalized = normalizeUrl(repoUrl);
  const tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'filer-pack-'));

  const branchArg = branch ? `--branch ${branch}` : '';
  const depthArg  = '--depth 1';   // shallow clone — we only need current state

  try {
    execSync(
      `git clone ${depthArg} ${branchArg} ${normalized} ${tmpDir}`,
      { stdio: 'pipe', timeout: 60_000 }
    );
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to clone ${normalized}: ${msg}`);
  }

  return {
    root: tmpDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

// ── Normalize GitHub shorthand to full URL ────────────────────────────────────

function normalizeUrl(input: string): string {
  // Already a full URL
  if (input.startsWith('https://') || input.startsWith('git@')) return input;

  // github.com/user/repo or user/repo
  const cleaned = input.replace(/^github\.com\//, '');
  if (/^[\w.-]+\/[\w.-]+$/.test(cleaned)) {
    return `https://github.com/${cleaned}.git`;
  }

  return input;
}
