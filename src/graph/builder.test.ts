import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildGraph } from './builder.js';
import { renderGraphSummary } from './summary.js';
import { buildViewerData } from './viewer.js';
import fs   from 'fs';
import path from 'path';
import os   from 'os';

// We test using a minimal temp repo so we don't depend on .filer/ existing
let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filer-graph-test-'));
  // Minimal .filer structure
  fs.mkdirSync(path.join(tmpDir, '.filer', 'constraint'), { recursive: true });
  // Write a minimal .filer-config.json
  fs.writeFileSync(
    path.join(tmpDir, '.filer', '.filer-config.json'),
    JSON.stringify({ llm: { provider: 'anthropic' }, include: ['src/**'], exclude: [] })
  );
  // No nodes, no src/ — graph should still build
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildGraph', () => {
  it('builds a graph output with correct shape', async () => {
    const graph = await buildGraph({ repoRoot: tmpDir, quiet: true, incremental: false });
    expect(graph).toHaveProperty('filer_version');
    expect(graph).toHaveProperty('graph_version');
    expect(graph).toHaveProperty('indexed_at');
    expect(graph).toHaveProperty('stats');
    expect(graph.nodes).toBeInstanceOf(Array);
    expect(graph.edges).toBeInstanceOf(Array);
  });

  it('writes graph.json to .filer/', async () => {
    await buildGraph({ repoRoot: tmpDir, quiet: true, incremental: false });
    const graphPath = path.join(tmpDir, '.filer', 'graph.json');
    expect(fs.existsSync(graphPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    expect(parsed.graph_version).toBe('1.0');
  });
});

describe('renderGraphSummary', () => {
  it('produces markdown with stats table', async () => {
    const graph = await buildGraph({ repoRoot: tmpDir, quiet: true, incremental: false });
    const md = renderGraphSummary(graph);
    expect(md).toContain('# Filer Knowledge Graph');
    expect(md).toContain('Structural nodes');
    expect(md).toContain('Files parsed');
  });
});

describe('buildViewerData', () => {
  it('produces viewer-compatible nodes and edges', async () => {
    const graph = await buildGraph({ repoRoot: tmpDir, quiet: true, incremental: false });
    const data = buildViewerData(graph);
    expect(data.nodes).toBeInstanceOf(Array);
    expect(data.edges).toBeInstanceOf(Array);
    // All edge endpoints must exist in nodes
    const ids = new Set(data.nodes.map(n => n.id));
    for (const e of data.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });
});
