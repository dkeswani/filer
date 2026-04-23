import { LLMGateway, parseJSON } from '../llm/mod.js';
import type { AnyNode } from '../schema/mod.js';

export interface ConflictPair {
  newNode:      AnyNode;
  existingNode: AnyNode;
  explanation:  string;
}

// ── Conflict detection system prompt ─────────────────────────────────────────

const CONFLICT_SYSTEM = `You are a knowledge conflict detector for the Filer codebase knowledge system.

Given pairs of knowledge nodes about the same codebase, determine if any pair semantically contradicts each other.

Two nodes CONTRADICT when:
- One says "always do X" and the other says "never do X" for the same scope
- One says "X is safe" and the other says "X is dangerous" for the same scope
- One claims a property is true and the other claims it is false for the same scope

Two nodes do NOT contradict when:
- They describe different aspects of the same topic
- One is more specific than the other
- They apply to different conditions

Return a JSON array. Each element must be: { "pair_index": number, "contradicts": boolean, "explanation": string }
Only include pairs where contradicts is true. If no contradictions, return [].`;

// ── Pre-filter: cheap text-overlap check before LLM call ─────────────────────

function extractStatementText(node: AnyNode): string {
  switch (node.type) {
    case 'constraint':  return `${node.statement} ${node.because} ${node.if_violated}`;
    case 'danger':      return `${node.statement} ${node.condition} ${node.safe_pattern}`;
    case 'security':    return `${node.statement} ${node.because} ${node.if_violated}`;
    case 'assumption':  return `${node.statement} ${node.breaks_when}`;
    case 'pattern':     return `${node.statement} ${node.why}`;
    case 'antipattern': return `${node.statement} ${node.why_its_wrong_here} ${node.correct_pattern}`;
    case 'decision':    return `${node.statement} ${node.reason}`;
    case 'intent':      return node.purpose;
  }
}

function scopesOverlap(a: string[], b: string[]): boolean {
  return a.some(as => b.some(bs =>
    as.startsWith(bs) || bs.startsWith(as) || as === bs
  ));
}

function hasConflictKeywords(textA: string, textB: string): boolean {
  const forbidPatterns = /\b(never|avoid|don't|do not|must not|forbidden|prohibited|dangerous|unsafe)\b/i;
  const requirePatterns = /\b(always|must|required|mandatory|ensure|safe|secure)\b/i;
  // Potential conflict if one asserts requirement and the other forbids (same topic)
  return (forbidPatterns.test(textA) && requirePatterns.test(textB)) ||
         (requirePatterns.test(textA) && forbidPatterns.test(textB));
}

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return wordsA.size > 0 ? overlap / wordsA.size : 0;
}

// ── Main detection function ───────────────────────────────────────────────────

export async function detectConflicts(
  gateway:       LLMGateway,
  newNodes:      AnyNode[],
  existingNodes: AnyNode[],
): Promise<ConflictPair[]> {
  type Candidate = { newNode: AnyNode; existingNode: AnyNode };
  const candidates: Candidate[] = [];

  for (const newNode of newNodes) {
    const textA = extractStatementText(newNode);
    const peers  = existingNodes.filter(e =>
      e.type === newNode.type &&
      e.id !== newNode.id &&
      scopesOverlap(newNode.scope, e.scope)
    );

    for (const existing of peers) {
      const textB = extractStatementText(existing);
      // Only consider as candidate if topics overlap AND keywords suggest contradiction
      if (wordOverlap(textA, textB) >= 0.25 && hasConflictKeywords(textA, textB)) {
        candidates.push({ newNode, existingNode: existing });
      }
    }
  }

  if (candidates.length === 0) return [];

  // Batch candidates into groups of 10 to limit per-call size
  const BATCH_SIZE = 10;
  const results: ConflictPair[] = [];

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const pairs = batch.map((c, idx) => ({
      pair_index:   idx,
      new_node:     { id: c.newNode.id, type: c.newNode.type, text: extractStatementText(c.newNode) },
      existing_node: { id: c.existingNode.id, type: c.existingNode.type, text: extractStatementText(c.existingNode) },
    }));

    const prompt = `Check these node pairs for semantic contradictions:\n\n${JSON.stringify(pairs, null, 2)}`;

    try {
      const response = await gateway.complete(
        'conflict.detect',
        [{ role: 'user', content: prompt }],
        { system: CONFLICT_SYSTEM, max_tokens: 800 }
      );

      const raw = parseJSON<Array<{ pair_index: number; contradicts: boolean; explanation: string }>>(response.content);
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (item.contradicts && typeof item.pair_index === 'number') {
            const candidate = batch[item.pair_index];
            if (candidate) {
              results.push({
                newNode:      candidate.newNode,
                existingNode: candidate.existingNode,
                explanation:  item.explanation ?? 'Semantic contradiction detected',
              });
            }
          }
        }
      }
    } catch {
      // Conflict detection is best-effort — don't fail the indexing run
    }
  }

  return results;
}
