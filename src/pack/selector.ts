import type { LLMGateway } from '../llm/mod.js';
import type { PackedFile } from './scanner.js';

// ── Task-based relevance scoring ──────────────────────────────────────────────
// Given a natural language task description, ask the LLM which files are
// most relevant. Returns files sorted by relevance, capped at tokenBudget.

interface RelevanceResult {
  path:      string;
  score:     number;   // 0–1
  reason:    string;
}

export async function selectRelevantFiles(
  gateway:     LLMGateway,
  files:       PackedFile[],
  task:        string,
  tokenBudget: number,
): Promise<PackedFile[]> {
  // Build a lightweight manifest (paths + first 3 lines) to avoid burning tokens
  const manifest = files.map(f => {
    const preview = f.content.split('\n').slice(0, 3).join(' ').slice(0, 120);
    return `${f.path} (${f.tokens} tokens): ${preview}`;
  }).join('\n');

  const prompt = `You are selecting files from a codebase that are relevant to a specific task.

## Task
${task}

## Available Files
${manifest}

## Instructions
Return a JSON array of the most relevant files, sorted by relevance (most relevant first).
Include ONLY files that are directly relevant to the task.
Exclude test files, config files, and unrelated modules unless specifically needed.

Response format:
[
  { "path": "src/payments/webhook.ts", "score": 0.95, "reason": "Direct implementation target" },
  { "path": "src/lib/stripe.ts", "score": 0.80, "reason": "Stripe SDK wrapper used by payments" }
]

Return [] if no files are clearly relevant.`;

  let results: RelevanceResult[] = [];
  try {
    results = await gateway.completeJSON<RelevanceResult[]>(
      'query.answer',
      [{ role: 'user', content: prompt }],
      { max_tokens: 2048 }
    );
  } catch {
    // Fallback: return all files sorted by change frequency
    return applyTokenBudget(files, tokenBudget);
  }

  if (!Array.isArray(results) || results.length === 0) {
    return applyTokenBudget(files, tokenBudget);
  }

  // Map back to PackedFile objects in relevance order
  const pathSet  = new Map(files.map(f => [f.path, f]));
  const selected: PackedFile[] = [];

  for (const r of results) {
    const file = pathSet.get(r.path);
    if (file) selected.push(file);
  }

  // Add any files that were scored but not found (fuzzy match)
  for (const r of results) {
    if (!pathSet.has(r.path)) {
      const fuzzy = files.find(f => f.path.endsWith(r.path) || r.path.endsWith(f.path));
      if (fuzzy && !selected.includes(fuzzy)) selected.push(fuzzy);
    }
  }

  return applyTokenBudget(selected, tokenBudget);
}

// ── Token budget enforcement ──────────────────────────────────────────────────

export function applyTokenBudget(files: PackedFile[], budget: number): PackedFile[] {
  if (!budget || budget <= 0) return files;

  const selected: PackedFile[] = [];
  let used = 0;

  for (const file of files) {
    if (used + file.tokens > budget) break;
    selected.push(file);
    used += file.tokens;
  }

  return selected;
}
