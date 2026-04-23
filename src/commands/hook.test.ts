import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { hookCommand } from './hook.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;
let hooksDir: string;
let hookPath: string;
let origCwd: string;

beforeEach(() => {
  tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'filer-hook-test-'));
  hooksDir = path.join(tmpDir, '.git', 'hooks');
  hookPath = path.join(hooksDir, 'post-commit');
  fs.mkdirSync(hooksDir, { recursive: true });
  origCwd  = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(origCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('hookCommand — install', () => {
  it('creates post-commit hook file', async () => {
    await hookCommand('install');
    expect(fs.existsSync(hookPath)).toBe(true);
  });

  it('hook file contains filer update command', async () => {
    await hookCommand('install');
    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toContain('filer layer --update --silent');
  });

  it('hook file exists with correct shebang', async () => {
    await hookCommand('install');
    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content.startsWith('#!/bin/sh')).toBe(true);
  });

  it('appends to existing hook without overwriting', async () => {
    const existing = '#!/bin/sh\necho "existing hook"\n';
    fs.writeFileSync(hookPath, existing, { mode: 0o755 });

    await hookCommand('install');
    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toContain('existing hook');
    expect(content).toContain('filer layer --update --silent');
  });

  it('does not duplicate if already installed', async () => {
    await hookCommand('install');
    await hookCommand('install');
    const content = fs.readFileSync(hookPath, 'utf-8');
    const count = (content.match(/filer layer --update --silent/g) ?? []).length;
    expect(count).toBe(1);
  });
});

describe('hookCommand — uninstall', () => {
  it('removes hook file when it was Filer-only', async () => {
    await hookCommand('install');
    expect(fs.existsSync(hookPath)).toBe(true);

    await hookCommand('uninstall');
    expect(fs.existsSync(hookPath)).toBe(false);
  });

  it('removes only filer section from mixed hook', async () => {
    const existing = '#!/bin/sh\necho "other hook"\n';
    fs.writeFileSync(hookPath, existing, { mode: 0o755 });
    await hookCommand('install');

    await hookCommand('uninstall');
    expect(fs.existsSync(hookPath)).toBe(true);
    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toContain('other hook');
    expect(content).not.toContain('filer layer --update --silent');
  });

  it('no-ops when hook is not installed', async () => {
    // Should not throw
    await expect(hookCommand('uninstall')).resolves.toBeUndefined();
  });
});

describe('hookCommand — status', () => {
  it('reports installed when hook exists', async () => {
    await hookCommand('install');
    // status just prints — verify it does not throw
    await expect(hookCommand('status')).resolves.toBeUndefined();
  });

  it('reports not installed when hook missing', async () => {
    await expect(hookCommand('status')).resolves.toBeUndefined();
  });
});

describe('hookCommand — invalid action', () => {
  it('exits with error on unknown action', async () => {
    await expect(hookCommand('bogus')).rejects.toThrow();
  });
});
