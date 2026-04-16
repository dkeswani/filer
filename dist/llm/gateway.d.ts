import type { LLMProvider, LLMResponse } from './types.js';
import type { FilerConfig } from '../schema/mod.js';
export type LLMTask = 'extract.full' | 'extract.update' | 'extract.prefilter' | 'learn.classify' | 'learn.propose' | 'query.answer' | 'verify.check';
export declare class LLMGateway {
    private provider;
    private config;
    private totalCost;
    private calls;
    constructor(config: FilerConfig);
    complete(task: LLMTask, messages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
    }>, opts?: {
        system?: string;
        max_tokens?: number;
        temperature?: number;
    }): Promise<LLMResponse>;
    completeJSON<T>(task: LLMTask, messages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
    }>, opts?: {
        system?: string;
        max_tokens?: number;
    }): Promise<T>;
    estimateCost(task: LLMTask, inputTokens: number): number;
    sessionStats(): {
        calls: number;
        estimated_usd: number;
    };
    private modelForTask;
    private withRetry;
}
export declare function createProvider(config: FilerConfig): LLMProvider;
export declare function parseJSON<T>(raw: string): T;
//# sourceMappingURL=gateway.d.ts.map