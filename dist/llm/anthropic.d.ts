import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';
export declare class AnthropicProvider implements LLMProvider {
    readonly name = "anthropic";
    private client;
    constructor(apiKey?: string);
    complete(req: LLMRequest): Promise<LLMResponse>;
}
//# sourceMappingURL=anthropic.d.ts.map