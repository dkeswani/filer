import { z } from 'zod';
import { parseJSON, EXTRACTION_SYSTEM, EXTRACTION_PROMPT_VERSION, buildExtractionPrompt, } from '../llm/mod.js';
import { AnyNodeSchema, } from '../schema/mod.js';
// ── Raw LLM output schema — permissive for parsing, then validated ────────────
const RawNodeSchema = z.record(z.unknown());
// ── Main extraction function ──────────────────────────────────────────────────
export async function extractNodes(gateway, opts) {
    const now = new Date().toISOString();
    const prompt = buildExtractionPrompt(opts);
    const response = await gateway.complete('extract.full', [{ role: 'user', content: prompt }], {
        system: EXTRACTION_SYSTEM,
        max_tokens: 6000,
    });
    // Parse and validate each node
    const rawItems = parseJSON(response.content);
    if (!Array.isArray(rawItems)) {
        return {
            nodes: [], rejected: [{ raw: rawItems, reason: 'LLM returned non-array' }],
            prompt_version: EXTRACTION_PROMPT_VERSION,
            input_tokens: response.input_tokens,
            output_tokens: response.output_tokens,
            estimated_usd: 0,
        };
    }
    const nodes = [];
    const rejected = [];
    for (const raw of rawItems) {
        const result = validateAndEnrich(raw, now, opts.modulePath);
        if (result.ok) {
            nodes.push(result.node);
        }
        else {
            rejected.push({ raw, reason: result.reason });
        }
    }
    const { estimateCost } = await import('../llm/types.js');
    const cost = estimateCost(response);
    return {
        nodes,
        rejected,
        prompt_version: EXTRACTION_PROMPT_VERSION,
        input_tokens: response.input_tokens,
        output_tokens: response.output_tokens,
        estimated_usd: cost.estimated_usd,
    };
}
function validateAndEnrich(raw, now, modulePath) {
    if (typeof raw !== 'object' || raw === null) {
        return { ok: false, reason: 'Not an object' };
    }
    const obj = raw;
    // Check minimum confidence threshold
    const confidence = typeof obj['confidence'] === 'number' ? obj['confidence'] : 0;
    if (confidence < 0.75) {
        return { ok: false, reason: `Confidence ${confidence} below threshold 0.75` };
    }
    // Enrich with metadata the LLM doesn't provide
    const enriched = {
        ...obj,
        version: 1,
        created_at: now,
        updated_at: now,
        indexed_by: 'claude-sonnet-4-6', // set by caller in production
        verified: false,
        stale_risk: 0,
        // Ensure arrays exist
        tags: Array.isArray(obj['tags']) ? obj['tags'] : [],
        related: Array.isArray(obj['related']) ? obj['related'] : [],
        supersedes: Array.isArray(obj['supersedes']) ? obj['supersedes'] : [],
        must_not: Array.isArray(obj['must_not']) ? obj['must_not'] : [],
        // Ensure scope is array and has at least modulePath
        scope: Array.isArray(obj['scope']) && obj['scope'].length > 0
            ? obj['scope']
            : [modulePath],
    };
    // Validate ID format
    if (typeof enriched['id'] !== 'string' || !enriched['id'].includes(':')) {
        return { ok: false, reason: `Invalid ID format: ${enriched['id']}` };
    }
    // Try to parse through the discriminated union
    const parsed = AnyNodeSchema.safeParse(enriched);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .slice(0, 3)
            .map(i => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
        return { ok: false, reason: `Schema validation failed: ${issues}` };
    }
    return { ok: true, node: parsed.data };
}
// ── Token estimation (no API call) ───────────────────────────────────────────
export function estimateModuleTokens(files) {
    // Rough estimate: 4 chars per token
    const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
    return Math.ceil(totalChars / 4);
}
//# sourceMappingURL=extractor.js.map