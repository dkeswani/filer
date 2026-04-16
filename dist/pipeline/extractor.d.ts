import { LLMGateway } from '../llm/mod.js';
import { AnyNode } from '../schema/mod.js';
export interface ExtractResult {
    nodes: AnyNode[];
    rejected: Array<{
        raw: unknown;
        reason: string;
    }>;
    prompt_version: string;
    input_tokens: number;
    output_tokens: number;
    estimated_usd: number;
}
export declare function extractNodes(gateway: LLMGateway, opts: {
    modulePath: string;
    files: Array<{
        path: string;
        content: string;
    }>;
    repoName: string;
    existingIds: string[];
    model?: string;
}): Promise<ExtractResult>;
export declare function estimateModuleTokens(files: Array<{
    content: string;
}>): number;
//# sourceMappingURL=extractor.d.ts.map