import { describe, it, expect } from 'vitest';
import { loadManifest, loadTemplate, resolveCategories } from './loader.js';
import { AnyNodeSchema } from '../schema/mod.js';

describe('loadManifest', () => {
  it('parses the manifest without error', () => {
    const manifest = loadManifest();
    expect(manifest.version).toBe('1.0');
    expect(typeof manifest.categories).toBe('object');
  });

  it('has all expected categories', () => {
    const manifest = loadManifest();
    const cats = Object.keys(manifest.categories);
    expect(cats).toContain('security');
    expect(cats).toContain('migrations');
    expect(cats).toContain('error-handling');
    expect(cats).toContain('data-access');
    expect(cats).toContain('api');
    expect(cats).toContain('meta');
  });
});

describe('loadTemplate', () => {
  it('every template in manifest passes AnyNodeSchema.parse()', () => {
    const manifest = loadManifest();
    const allPaths = Object.values(manifest.categories).flatMap(c => c.templates);
    for (const tplPath of allPaths) {
      expect(() => loadTemplate(tplPath), `${tplPath} failed schema validation`).not.toThrow();
    }
  });

  it('loaded template has correct shape', () => {
    const node = loadTemplate('security/never-log-secrets');
    expect(node.id).toBe('security:never-log-secrets');
    expect(node.type).toBe('security');
    expect(node.verified).toBe(false);
  });
});

describe('resolveCategories', () => {
  it('resolves a single category to its template paths', () => {
    const paths = resolveCategories(['security']);
    expect(paths).toHaveLength(6);
    expect(paths).toContain('security/never-log-secrets');
  });

  it('"all" resolves everything except meta', () => {
    const manifest = loadManifest();
    const allExceptMeta = Object.entries(manifest.categories)
      .filter(([k]) => k !== 'meta')
      .flatMap(([, v]) => v.templates);
    const paths = resolveCategories(['all']);
    expect(paths.sort()).toEqual(allExceptMeta.sort());
  });

  it('"all,meta" resolves literally everything', () => {
    const manifest = loadManifest();
    const everything = Object.values(manifest.categories).flatMap(c => c.templates);
    const paths = resolveCategories(['all', 'meta']);
    expect(paths.sort()).toEqual(everything.sort());
  });

  it('deduplicates when a category is listed twice', () => {
    const once = resolveCategories(['security']);
    const twice = resolveCategories(['security', 'security']);
    expect(twice).toHaveLength(once.length);
  });

  it('throws on unknown category with a useful message', () => {
    expect(() => resolveCategories(['nonexistent'])).toThrow(/Unknown category/);
    expect(() => resolveCategories(['nonexistent'])).toThrow(/nonexistent/);
  });
});
