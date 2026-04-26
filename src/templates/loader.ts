import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AnyNode, AnyNodeSchema } from '../schema/mod.js';

export interface TemplateManifest {
  version: string;
  categories: Record<string, {
    label: string;
    description: string;
    templates: string[];
  }>;
}

export function getTemplatesDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // In dist/: dist/templates/loader.js → ../../templates
  // In src/:  src/templates/loader.ts  → ../../templates
  return path.resolve(path.dirname(thisFile), '..', '..', 'templates');
}

export function loadManifest(): TemplateManifest {
  const manifestPath = path.join(getTemplatesDir(), 'manifest.json');
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw) as TemplateManifest;
}

export function loadTemplate(relativePath: string): AnyNode {
  const fullPath = path.join(getTemplatesDir(), `${relativePath}.json`);
  const raw = fs.readFileSync(fullPath, 'utf-8');
  return AnyNodeSchema.parse(JSON.parse(raw));
}

export function resolveCategories(categories: string[]): string[] {
  const manifest = loadManifest();
  const validCategories = Object.keys(manifest.categories);

  const expanded = new Set<string>();
  for (const cat of categories) {
    if (cat === 'all') {
      for (const key of validCategories) {
        if (key !== 'meta') {
          for (const tpl of manifest.categories[key].templates) {
            expanded.add(tpl);
          }
        }
      }
    } else {
      if (!manifest.categories[cat]) {
        throw new Error(
          `Unknown category: "${cat}". Valid categories: ${validCategories.join(', ')}`
        );
      }
      for (const tpl of manifest.categories[cat].templates) {
        expanded.add(tpl);
      }
    }
  }

  return Array.from(expanded);
}
