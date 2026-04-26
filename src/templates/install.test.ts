import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { installTemplates } from './install.js';
import { readNode } from '../store/mod.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'filer-install-test-'));
}

describe('installTemplates', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('installing "security" produces 6 files with the right names', async () => {
    const root = makeTmpDir();
    tmpDirs.push(root);

    const result = await installTemplates(root, 'security');

    expect(result.installed).toBe(6);
    expect(result.skipped).toBe(0);

    const node = readNode(root, 'security:never-log-secrets');
    expect(node).not.toBeNull();
    expect(node?.id).toBe('security:never-log-secrets');
  });

  it('installing twice does not overwrite — second run skips all', async () => {
    const root = makeTmpDir();
    tmpDirs.push(root);

    const first = await installTemplates(root, 'security');
    const second = await installTemplates(root, 'security');

    expect(first.installed).toBe(6);
    expect(second.installed).toBe(0);
    expect(second.skipped).toBe(6);
  });

  it('unknown category exits with useful error', async () => {
    const root = makeTmpDir();
    tmpDirs.push(root);

    await expect(installTemplates(root, 'nonexistent')).rejects.toThrow(/Unknown category/);
  });

  it('installing multiple categories installs all templates from each', async () => {
    const root = makeTmpDir();
    tmpDirs.push(root);

    const result = await installTemplates(root, 'security,migrations');
    expect(result.installed).toBe(10); // 6 security + 4 migrations
  });
});
