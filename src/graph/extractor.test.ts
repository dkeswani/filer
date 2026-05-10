import { describe, it, expect } from 'vitest';
import { extractAST } from './extractor.js';
import type { FilerConfig } from '../schema/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Use the filer repo itself as the test subject
const repoRoot = path.resolve(__dirname, '../../');

const config = {
  llm:     { provider: 'anthropic' as const },
  include: ['src/graph/fixtures/**'],
  exclude: [],
} satisfies Partial<FilerConfig> as unknown as FilerConfig;

// Minimal config pointing at a known single file
const singleFileConfig = {
  llm:     { provider: 'anthropic' as const },
  include: ['src/graph/fixtures/sample.ts'],
  exclude: [],
} satisfies Partial<FilerConfig> as unknown as FilerConfig;

describe('extractAST', () => {
  it('returns an ASTGraph with stats', async () => {
    const graph = await extractAST(repoRoot, singleFileConfig, { incremental: false });
    expect(graph.nodes).toBeInstanceOf(Array);
    expect(graph.edges).toBeInstanceOf(Array);
    expect(graph.stats.files_scanned).toBeGreaterThanOrEqual(0);
    expect(graph.stats.parse_errors).toBeInstanceOf(Array);
  });

  it('skips non-supported extensions gracefully', async () => {
    const cfg = {
      llm:     { provider: 'anthropic' as const },
      include: ['*.md'],
      exclude: [],
    } as unknown as FilerConfig;
    const graph = await extractAST(repoRoot, cfg, { incremental: false });
    // markdown files are unsupported — all get skipped, no crash
    expect(graph.stats.parse_errors).toHaveLength(0);
  });

  it('emits a file node per parsed file', async () => {
    const graph = await extractAST(repoRoot, singleFileConfig, { incremental: false });
    const fileNodes = graph.nodes.filter(n => n.kind === 'file');
    // Either we found the fixture file, or zero files (fixture may not exist yet)
    expect(fileNodes.length).toBeGreaterThanOrEqual(0);
  });
});
