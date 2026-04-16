import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { groupIntoModules } from '../pipeline/scanner.js';
import type { SourceFile } from '../pipeline/scanner.js';
import type { FilerConfig } from '../schema/mod.js';

const defaultConfig: FilerConfig = {
  version: '1.0',
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    indexing_model: 'claude-haiku-4-5-20251001',
    deep_model: 'claude-sonnet-4-6',
  },
  include: ['src/**'],
  exclude: ['**/node_modules/**'],
  module_boundaries: {
    strategy: 'directory',
    max_depth: 3,
    manifests: ['package.json'],
  },
  node_types: {} as any,
  auto_update: true,
  stale_threshold: 0.7,
};

function makeFile(filePath: string, content = 'x'.repeat(100)): SourceFile {
  return {
    path: filePath,
    absolutePath: `/repo/${filePath}`,
    content,
    sizeBytes: content.length,
  };
}

describe('groupIntoModules', () => {
  it('groups files by directory at max_depth=2', () => {
    const files = [
      makeFile('src/auth/validate.ts'),
      makeFile('src/auth/types.ts'),
      makeFile('src/payments/process.ts'),
    ];

    const config = { ...defaultConfig, module_boundaries: { ...defaultConfig.module_boundaries, max_depth: 2 } };
    const modules = groupIntoModules(files, config);

    expect(modules.some(m => m.path === 'src/auth')).toBe(true);
    expect(modules.some(m => m.path === 'src/payments')).toBe(true);

    const authModule = modules.find(m => m.path === 'src/auth');
    expect(authModule?.files).toHaveLength(2);
  });

  it('groups files by directory at max_depth=1', () => {
    const files = [
      makeFile('src/auth/validate.ts'),
      makeFile('src/auth/types.ts'),
      makeFile('src/payments/process.ts'),
    ];

    const config = { ...defaultConfig, module_boundaries: { ...defaultConfig.module_boundaries, max_depth: 1 } };
    const modules = groupIntoModules(files, config);

    expect(modules.some(m => m.path === 'src')).toBe(true);
    const srcModule = modules.find(m => m.path === 'src');
    expect(srcModule?.files).toHaveLength(3);
  });

  it('handles root-level files', () => {
    const files = [makeFile('index.ts'), makeFile('config.ts')];
    const modules = groupIntoModules(files, defaultConfig);
    expect(modules.length).toBeGreaterThan(0);
  });

  it('sorts modules by path', () => {
    const files = [
      makeFile('src/z-module/file.ts'),
      makeFile('src/a-module/file.ts'),
    ];
    const modules = groupIntoModules(files, defaultConfig);
    expect(modules[0].path < modules[1].path).toBe(true);
  });

  it('reports estimated token count per module', () => {
    const content = 'x'.repeat(4000);  // ~1000 tokens
    const files = [makeFile('src/auth/validate.ts', content)];
    const modules = groupIntoModules(files, defaultConfig);
    const authModule = modules.find(m => m.files.some(f => f.path.includes('auth')));
    expect(authModule?.tokens).toBeGreaterThan(0);
  });

  it('splits oversized modules', () => {
    // Create many large files in same directory to exceed MAX_MODULE_TOKENS
    const bigContent = 'x'.repeat(40_000);  // ~10k tokens each
    const files = Array.from({ length: 5 }, (_, i) =>
      makeFile(`src/bigmodule/file${i}.ts`, bigContent)
    );
    const modules = groupIntoModules(files, defaultConfig);
    // Should split into multiple chunks
    const bigModules = modules.filter(m => m.path === 'src/bigmodule');
    expect(bigModules.length).toBeGreaterThan(1);
  });

  it('groups by manifest when strategy is package_manifest', () => {
    const files = [
      makeFile('packages/auth/package.json', '{"name":"auth"}'),
      makeFile('packages/auth/src/index.ts'),
      makeFile('packages/payments/package.json', '{"name":"payments"}'),
      makeFile('packages/payments/src/index.ts'),
    ];
    const config = {
      ...defaultConfig,
      module_boundaries: { ...defaultConfig.module_boundaries, strategy: 'package_manifest' as const },
    };
    const modules = groupIntoModules(files, config);
    expect(modules.some(m => m.path === 'packages/auth')).toBe(true);
    expect(modules.some(m => m.path === 'packages/payments')).toBe(true);
  });
});
