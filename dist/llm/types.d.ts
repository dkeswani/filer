export interface LLMMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
export interface LLMRequest {
    messages: LLMMessage[];
    system?: string;
    model: string;
    max_tokens: number;
    temperature: number;
}
export interface LLMResponse {
    content: string;
    input_tokens: number;
    output_tokens: number;
    model: string;
}
export interface LLMProvider {
    complete(req: LLMRequest): Promise<LLMResponse>;
    name: string;
}
export interface LLMCost {
    input_tokens: number;
    output_tokens: number;
    model: string;
    estimated_usd: number;
}
export declare function estimateCost(res: LLMResponse): LLMCost;
export declare function estimateTokenCost(input_tokens: number, output_tokens: number, model: string): number;
//# sourceMappingURL=types.d.ts.map