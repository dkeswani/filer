import { estimateCost } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';
// ── Gateway ───────────────────────────────────────────────────────────────────
export class LLMGateway {
    provider;
    config;
    totalCost = 0;
    calls = 0;
    constructor(config) {
        this.config = config;
        this.provider = createProvider(config);
    }
    // ── Main completion method with retry ────────────────────────────────────
    async complete(task, messages, opts = {}) {
        const model = this.modelForTask(task);
        const req = {
            messages,
            system: opts.system,
            model,
            max_tokens: opts.max_tokens ?? 4096,
            temperature: opts.temperature ?? 0.1,
        };
        const response = await this.withRetry(req);
        const cost = estimateCost(response);
        this.totalCost += cost.estimated_usd;
        this.calls++;
        return response;
    }
    // ── JSON completion — parses and retries on invalid JSON ──────────────────
    async completeJSON(task, messages, opts = {}) {
        const response = await this.complete(task, messages, {
            ...opts,
            temperature: 0.0, // deterministic for JSON output
        });
        return parseJSON(response.content);
    }
    // ── Cost estimation (no API call) ─────────────────────────────────────────
    estimateCost(task, inputTokens) {
        const model = this.modelForTask(task);
        // Rough estimate: output ~20% of input for extraction tasks
        const outputTokens = Math.round(inputTokens * 0.2);
        const { estimateTokenCost } = require('./types.js');
        return estimateTokenCost(inputTokens, outputTokens, model);
    }
    // ── Session stats ─────────────────────────────────────────────────────────
    sessionStats() {
        return { calls: this.calls, estimated_usd: Math.round(this.totalCost * 10000) / 10000 };
    }
    // ── Internal helpers ──────────────────────────────────────────────────────
    modelForTask(task) {
        const { llm } = this.config;
        const deepTasks = ['extract.full', 'learn.propose', 'query.answer'];
        return deepTasks.includes(task) ? llm.deep_model : llm.indexing_model;
    }
    async withRetry(req, maxRetries = 3) {
        let lastErr;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.provider.complete(req);
            }
            catch (err) {
                lastErr = err;
                const isRateLimit = lastErr.message.includes('rate_limit') ||
                    lastErr.message.includes('429') ||
                    lastErr.message.includes('overloaded');
                if (!isRateLimit || attempt === maxRetries)
                    break;
                // Exponential backoff: 2s, 4s, 8s
                const delay = Math.pow(2, attempt) * 1000;
                process.stderr.write(`  LLM rate limited. Retrying in ${delay / 1000}s...\n`);
                await sleep(delay);
            }
        }
        throw lastErr ?? new Error('LLM request failed');
    }
}
// ── Provider factory ──────────────────────────────────────────────────────────
export function createProvider(config) {
    switch (config.llm.provider) {
        case 'anthropic':
            return new AnthropicProvider();
        case 'openai':
            return new OpenAIProvider();
        case 'ollama':
            return new OllamaProvider(config.llm.base_url);
        default:
            throw new Error(`Unknown LLM provider: ${config.llm.provider}`);
    }
}
// ── JSON parser with cleanup ──────────────────────────────────────────────────
export function parseJSON(raw) {
    // Strip markdown code fences if present
    const cleaned = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/\s*```$/m, '')
        .trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        // Try to find a JSON array or object in the response
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrayMatch)
            return JSON.parse(arrayMatch[0]);
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objMatch)
            return JSON.parse(objMatch[0]);
        throw new Error(`Failed to parse LLM JSON response.\nRaw: ${raw.slice(0, 500)}`);
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=gateway.js.map