export interface IndexOptions {
    root: string;
    scope?: string;
    force?: boolean;
    dryRun?: boolean;
    silent?: boolean;
    changedOnly?: string[];
}
export interface IndexResult {
    modules_processed: number;
    nodes_created: number;
    nodes_updated: number;
    nodes_rejected: number;
    files_indexed: number;
    estimated_usd: number;
    errors: string[];
}
export declare function runIndex(opts: IndexOptions): Promise<IndexResult>;
export declare function runUpdate(root: string, opts?: {
    silent?: boolean;
}): Promise<IndexResult>;
//# sourceMappingURL=indexer.d.ts.map