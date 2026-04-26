import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'filer-init-test-'));
}

describe('initCommand — bug fixes', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  // Bug 1: --templates validation runs before any file I/O
  it('exits non-zero before creating .filer/ when category is invalid', async () => {
    const root = makeTmpDir();
    tmpDirs.push(root);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);

    const { initCommand } = await import('./init.js');

    await expect(initCommand({ templates: 'banana' })).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fs.existsSync(path.join(root, '.filer'))).toBe(false);

    cwdSpy.mockRestore();
  });

  // Bug 2: exit code is 1 (not 0) on the "already exists" path
  it('exits non-zero when .filer/ already exists and --force not set', async () => {
    const root = makeTmpDir();
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, '.filer'));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);

    const { initCommand } = await import('./init.js');

    await expect(initCommand({})).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    cwdSpy.mockRestore();
  });

  // Bug 3: --templates on existing .filer/ installs templates without requiring --force
  it('installs templates into existing .filer/ without --force', async () => {
    const root = makeTmpDir();
    tmpDirs.push(root);

    // First, run a real init to create .filer/
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);

    const { initCommand } = await import('./init.js');
    await initCommand({ provider: 'anthropic', noHook: true });

    expect(fs.existsSync(path.join(root, '.filer'))).toBe(true);

    // Now run with --templates on the existing repo — should NOT exit non-zero
    expect(exitSpy).not.toHaveBeenCalled();

    await initCommand({ templates: 'security' });

    expect(exitSpy).not.toHaveBeenCalled();

    // The 6 security templates should be installed under .filer/security/
    const secDir = path.join(root, '.filer', 'security');
    expect(fs.existsSync(secDir)).toBe(true);
    const files = fs.readdirSync(secDir);
    expect(files).toHaveLength(6);

    cwdSpy.mockRestore();
  });
});
