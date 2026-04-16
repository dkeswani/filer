import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';
export declare class OpenAIProvider implements LLMProvider {
    readonly name = "openai";
    private apiKey;
    constructor(apiKey?: string);
    complete(req: LLMRequest): Promise<LLMResponse>;
}
//# sourceMappingURL=openai.d.ts.map