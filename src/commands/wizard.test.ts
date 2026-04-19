import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { detectProjectType, pickTopFinding } from './wizard.js';
import type { AnyNode } from '../schema/mod.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

function makeNode(overrides: Partial<AnyNode> & { id: string; type: AnyNode['type'] }): AnyNode {
  return {
    version: 1, created_at: now, updated_at: now,
    indexed_by: 'claude-sonnet-4-6',
    scope: ['src/'],
    tags: [],
    confidence: 0.95,
    verified: false,
    stale_risk: 0,
    related: [], supersedes: [], must_not: [],
    ...overrides,
  } as AnyNode;
}

function makeSecurity(id: string, severity: 'critical' | 'high' | 'medium', confidence = 0.95): AnyNode {
  return makeNode({
    id, type: 'security',
    severity, category: 'data-exposure', confidence,
    statement: 'Never log PII.',
    because: 'GDPR.',
    if_violated: 'Fines.',
    safe_pattern: 'Log id only.',
    audit_required: false,
    what_requires_audit: [],
    what_does_not_require_audit: [],
    verification_required: true,
  });
}

function makeConstraint(id: string, confidence = 0.95): AnyNode {
  return makeNode({
    id, type: 'constraint', confidence,
    statement: 'Never bypass rate limiter.',
    because: 'DDoS protection.',
    if_violated: 'Service outage.',
  });
}

function makeDanger(id: string, confidence = 0.95): AnyNode {
  return makeNode({
    id, type: 'danger', confidence,
    statement: 'Concurrent writes can double-charge.',
    condition: 'Two requests in same window.',
    safe_pattern: 'Use idempotency key.',
  });
}

// ── detectProjectType ─────────────────────────────────────────────────────────

describe('detectProjectType', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filer-wizard-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects Next.js from next.config.js', () => {
    fs.writeFileSync(path.join(tmpDir, 'next.config.js'), '');
    expect(detectProjectType(tmpDir)).toBe('Next.js');
  });

  it('detects Next.js from next.config.ts', () => {
    fs.writeFileSync(path.join(tmpDir, 'next.config.ts'), '');
    expect(detectProjectType(tmpDir)).toBe('Next.js');
  });

  it('detects Go from go.mod', () => {
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com/app\n');
    expect(detectProjectType(tmpDir)).toBe('Go');
  });

  it('detects Rust from Cargo.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "app"\n');
    expect(detectProjectType(tmpDir)).toBe('Rust');
  });

  it('detects Python from requirements.txt', () => {
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'fastapi\n');
    expect(detectProjectType(tmpDir)).toBe('Python/FastAPI');
  });

  it('detects Python from pyproject.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[tool.poetry]\n');
    expect(detectProjectType(tmpDir)).toBe('Python/FastAPI');
  });

  it('detects Express from package.json with express dep', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.18.0' },
    }));
    expect(detectProjectType(tmpDir)).toBe('Express');
  });

  it('detects TypeScript from tsconfig.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ dependencies: {} }));
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    expect(detectProjectType(tmpDir)).toBe('TypeScript');
  });

  it('detects JavaScript from bare package.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ dependencies: {} }));
    expect(detectProjectType(tmpDir)).toBe('JavaScript');
  });

  it('falls back to Mixed for unknown project', () => {
    expect(detectProjectType(tmpDir)).toBe('Mixed');
  });
});

// ── pickTopFinding ────────────────────────────────────────────────────────────

describe('pickTopFinding', () => {
  it('returns critical security node first', () => {
    const nodes = [
      makeConstraint('constraint:a'),
      makeSecurity('security:critical', 'critical', 0.95),
      makeSecurity('security:high', 'high'),
    ];
    expect(pickTopFinding(nodes)!.id).toBe('security:critical');
  });

  it('returns high security when no critical', () => {
    const nodes = [
      makeConstraint('constraint:a'),
      makeSecurity('security:high', 'high'),
    ];
    expect(pickTopFinding(nodes)!.id).toBe('security:high');
  });

  it('returns constraint when no security nodes', () => {
    const nodes = [
      makeDanger('danger:a', 0.85),
      makeConstraint('constraint:a', 0.95),
    ];
    expect(pickTopFinding(nodes)!.id).toBe('constraint:a');
  });

  it('returns danger when no security or qualifying constraint', () => {
    const nodes = [
      makeDanger('danger:a', 0.95),
      makeConstraint('constraint:low', 0.70),
    ];
    expect(pickTopFinding(nodes)!.id).toBe('danger:a');
  });

  it('returns null for empty nodes', () => {
    expect(pickTopFinding([])).toBeNull();
  });

  it('returns null when no node meets the bar', () => {
    const nodes = [
      makeConstraint('constraint:low', 0.70),
      makeDanger('danger:low', 0.60),
    ];
    expect(pickTopFinding(nodes)).toBeNull();
  });

  it('skips critical security node with confidence < 0.90', () => {
    const nodes = [
      makeSecurity('security:low-conf', 'critical', 0.85),
      makeSecurity('security:high', 'high', 0.95),
    ];
    // critical but below 0.90 threshold → falls through to high
    expect(pickTopFinding(nodes)!.id).toBe('security:high');
  });
});
