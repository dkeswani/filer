// Provider-agnostic LLM interface.
// All enrichment workers call this — never a provider SDK directly.
// Approximate pricing per 1M tokens (update as needed)
const PRICING = {
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
    'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
    'claude-haiku-4-5': { input: 0.80, output: 4.00 },
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'llama3.3': { input: 0.00, output: 0.00 }, // local
};
export function estimateCost(res) {
    const pricing = PRICING[res.model] ?? { input: 3.00, output: 15.00 };
    const usd = (res.input_tokens / 1_000_000 * pricing.input)
        + (res.output_tokens / 1_000_000 * pricing.output);
    return {
        input_tokens: res.input_tokens,
        output_tokens: res.output_tokens,
        model: res.model,
        estimated_usd: Math.round(usd * 10000) / 10000,
    };
}
export function estimateTokenCost(input_tokens, output_tokens, model) {
    const pricing = PRICING[model] ?? { input: 3.00, output: 15.00 };
    return (input_tokens / 1_000_000 * pricing.input)
        + (output_tokens / 1_000_000 * pricing.output);
}
//# sourceMappingURL=types.js.map