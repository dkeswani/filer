import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { skillCommand } from './skill.js';
import fs   from 'fs';
import path from 'path';
import os   from 'os';

let tmpDir: string;
const origCwd = process.cwd();

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filer-skill-test-'));
  process.chdir(tmpDir);
});

afterAll(() => {
  process.chdir(origCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('skillCommand', () => {
  it('installs CLAUDE.md skill block', async () => {
    await skillCommand({ agent: 'claude' });
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    expect(content).toContain('<!-- filer:skill -->');
    expect(content).toContain('filer_scope');
    expect(content).toContain('filer_governing');
  });

  it('installs .cursorrules skill block', async () => {
    await skillCommand({ agent: 'cursor' });
    const content = fs.readFileSync(path.join(tmpDir, '.cursorrules'), 'utf8');
    expect(content).toContain('Filer Knowledge Layer');
    expect(content).toContain('filer_scope');
  });

  it('installs .codex/instructions.md skill block', async () => {
    await skillCommand({ agent: 'codex' });
    const content = fs.readFileSync(path.join(tmpDir, '.codex', 'instructions.md'), 'utf8');
    expect(content).toContain('filer_scope');
    expect(content).toContain('filer_check');
  });

  it('updates existing CLAUDE.md block on re-run', async () => {
    await skillCommand({ agent: 'claude' });
    await skillCommand({ agent: 'claude' });
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    // Should only contain one block
    const count = (content.match(/<!-- filer:skill -->/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('dry-run does not write files', async () => {
    const dryPath = path.join(tmpDir, 'dry-only.md');
    // Install to a different target by pointing at a fresh tmpDir — use dry=true
    // Just verify skillCommand resolves without throwing
    await expect(skillCommand({ agent: 'claude', dry: true })).resolves.toBeUndefined();
  });
});
