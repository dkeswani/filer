import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';
export declare class OllamaProvider implements LLMProvider {
    readonly name = "ollama";
    private baseUrl;
    constructor(baseUrl?: string);
    complete(req: LLMRequest): Promise<LLMResponse>;
}
//# sourceMappingURL=ollama.d.ts.map