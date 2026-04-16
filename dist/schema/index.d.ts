import { z } from 'zod';
export declare const NodeSummarySchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<[string, ...string[]]>;
    file: z.ZodString;
    scope: z.ZodArray<z.ZodString, "many">;
    summary: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    confidence: z.ZodNumber;
    verified: z.ZodBoolean;
    stale_risk: z.ZodNumber;
    updated_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: string;
    updated_at: string;
    scope: string[];
    tags: string[];
    confidence: number;
    verified: boolean;
    stale_risk: number;
    file: string;
    summary: string;
}, {
    id: string;
    type: string;
    updated_at: string;
    scope: string[];
    tags: string[];
    confidence: number;
    verified: boolean;
    stale_risk: number;
    file: string;
    summary: string;
}>;
export type NodeSummary = z.infer<typeof NodeSummarySchema>;
export declare const IndexStatsSchema: z.ZodObject<{
    files_indexed: z.ZodNumber;
    nodes_total: z.ZodNumber;
    by_type: z.ZodRecord<z.ZodString, z.ZodNumber>;
    coverage_pct: z.ZodNumber;
    verified_pct: z.ZodNumber;
    stale_count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    files_indexed: number;
    nodes_total: number;
    by_type: Record<string, number>;
    coverage_pct: number;
    verified_pct: number;
    stale_count: number;
}, {
    files_indexed: number;
    nodes_total: number;
    by_type: Record<string, number>;
    coverage_pct: number;
    verified_pct: number;
    stale_count: number;
}>;
export type IndexStats = z.infer<typeof IndexStatsSchema>;
export declare const FilerIndexSchema: z.ZodObject<{
    filer_version: z.ZodString;
    repo: z.ZodString;
    indexed_at: z.ZodString;
    last_commit: z.ZodOptional<z.ZodString>;
    llm: z.ZodString;
    stats: z.ZodObject<{
        files_indexed: z.ZodNumber;
        nodes_total: z.ZodNumber;
        by_type: z.ZodRecord<z.ZodString, z.ZodNumber>;
        coverage_pct: z.ZodNumber;
        verified_pct: z.ZodNumber;
        stale_count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        files_indexed: number;
        nodes_total: number;
        by_type: Record<string, number>;
        coverage_pct: number;
        verified_pct: number;
        stale_count: number;
    }, {
        files_indexed: number;
        nodes_total: number;
        by_type: Record<string, number>;
        coverage_pct: number;
        verified_pct: number;
        stale_count: number;
    }>;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<[string, ...string[]]>;
        file: z.ZodString;
        scope: z.ZodArray<z.ZodString, "many">;
        summary: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        confidence: z.ZodNumber;
        verified: z.ZodBoolean;
        stale_risk: z.ZodNumber;
        updated_at: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        type: string;
        updated_at: string;
        scope: string[];
        tags: string[];
        confidence: number;
        verified: boolean;
        stale_risk: number;
        file: string;
        summary: string;
    }, {
        id: string;
        type: string;
        updated_at: string;
        scope: string[];
        tags: string[];
        confidence: number;
        verified: boolean;
        stale_risk: number;
        file: string;
        summary: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    filer_version: string;
    repo: string;
    indexed_at: string;
    llm: string;
    stats: {
        files_indexed: number;
        nodes_total: number;
        by_type: Record<string, number>;
        coverage_pct: number;
        verified_pct: number;
        stale_count: number;
    };
    nodes: {
        id: string;
        type: string;
        updated_at: string;
        scope: string[];
        tags: string[];
        confidence: number;
        verified: boolean;
        stale_risk: number;
        file: string;
        summary: string;
    }[];
    last_commit?: string | undefined;
}, {
    filer_version: string;
    repo: string;
    indexed_at: string;
    llm: string;
    stats: {
        files_indexed: number;
        nodes_total: number;
        by_type: Record<string, number>;
        coverage_pct: number;
        verified_pct: number;
        stale_count: number;
    };
    nodes: {
        id: string;
        type: string;
        updated_at: string;
        scope: string[];
        tags: string[];
        confidence: number;
        verified: boolean;
        stale_risk: number;
        file: string;
        summary: string;
    }[];
    last_commit?: string | undefined;
}>;
export type FilerIndex = z.infer<typeof FilerIndexSchema>;
export declare const NodeTypeConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    min_confidence: z.ZodDefault<z.ZodNumber>;
    require_verification: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    min_confidence: number;
    require_verification: boolean;
}, {
    enabled?: boolean | undefined;
    min_confidence?: number | undefined;
    require_verification?: boolean | undefined;
}>;
export declare const FilerConfigSchema: z.ZodObject<{
    version: z.ZodDefault<z.ZodString>;
    llm: z.ZodObject<{
        provider: z.ZodDefault<z.ZodEnum<["anthropic", "openai", "ollama"]>>;
        model: z.ZodDefault<z.ZodString>;
        indexing_model: z.ZodDefault<z.ZodString>;
        deep_model: z.ZodDefault<z.ZodString>;
        base_url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        provider: "anthropic" | "openai" | "ollama";
        model: string;
        indexing_model: string;
        deep_model: string;
        base_url?: string | undefined;
    }, {
        provider?: "anthropic" | "openai" | "ollama" | undefined;
        model?: string | undefined;
        indexing_model?: string | undefined;
        deep_model?: string | undefined;
        base_url?: string | undefined;
    }>;
    include: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    exclude: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    module_boundaries: z.ZodDefault<z.ZodObject<{
        strategy: z.ZodDefault<z.ZodEnum<["directory", "package_manifest", "explicit"]>>;
        max_depth: z.ZodDefault<z.ZodNumber>;
        manifests: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        strategy: "directory" | "package_manifest" | "explicit";
        max_depth: number;
        manifests: string[];
    }, {
        strategy?: "directory" | "package_manifest" | "explicit" | undefined;
        max_depth?: number | undefined;
        manifests?: string[] | undefined;
    }>>;
    node_types: z.ZodDefault<z.ZodObject<{
        constraint: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            min_confidence: z.ZodDefault<z.ZodNumber>;
            require_verification: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        }, {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        }>>;
        danger: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            min_confidence: z.ZodDefault<z.ZodNumber>;
            require_verification: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        }, {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        }>>;
        assumption: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            min_confidence: z.ZodDefault<z.ZodNumber>;
            require_verification: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        }, {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        }>>;
        pattern: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            min_confidence: z.ZodDefault<z.ZodNumber>;
            require_verification: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        }, {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        }>>;
        intent: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            min_confidence: z.ZodDefault<z.ZodNumber>;
            require_verification: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        }, {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        }>>;
        decision: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            min_confidence: z.ZodDefault<z.ZodNumber>;
            require_verification: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        }, {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        }>>;
        security: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
        } & {
            require_verification: z.ZodDefault<z.ZodBoolean>;
            min_confidence: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        }, {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        }>>;
        antipattern: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            min_confidence: z.ZodDefault<z.ZodNumber>;
            require_verification: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        }, {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        intent: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        constraint: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        assumption: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        danger: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        pattern: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        decision: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        security: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        antipattern: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
    }, {
        intent?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        constraint?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        assumption?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        danger?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        pattern?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        decision?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        security?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        antipattern?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
    }>>;
    auto_update: z.ZodDefault<z.ZodBoolean>;
    stale_threshold: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    version: string;
    llm: {
        provider: "anthropic" | "openai" | "ollama";
        model: string;
        indexing_model: string;
        deep_model: string;
        base_url?: string | undefined;
    };
    include: string[];
    exclude: string[];
    module_boundaries: {
        strategy: "directory" | "package_manifest" | "explicit";
        max_depth: number;
        manifests: string[];
    };
    node_types: {
        intent: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        constraint: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        assumption: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        danger: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        pattern: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        decision: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        security: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
        antipattern: {
            enabled: boolean;
            min_confidence: number;
            require_verification: boolean;
        };
    };
    auto_update: boolean;
    stale_threshold: number;
}, {
    llm: {
        provider?: "anthropic" | "openai" | "ollama" | undefined;
        model?: string | undefined;
        indexing_model?: string | undefined;
        deep_model?: string | undefined;
        base_url?: string | undefined;
    };
    version?: string | undefined;
    include?: string[] | undefined;
    exclude?: string[] | undefined;
    module_boundaries?: {
        strategy?: "directory" | "package_manifest" | "explicit" | undefined;
        max_depth?: number | undefined;
        manifests?: string[] | undefined;
    } | undefined;
    node_types?: {
        intent?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        constraint?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        assumption?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        danger?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        pattern?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        decision?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        security?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
        antipattern?: {
            enabled?: boolean | undefined;
            min_confidence?: number | undefined;
            require_verification?: boolean | undefined;
        } | undefined;
    } | undefined;
    auto_update?: boolean | undefined;
    stale_threshold?: number | undefined;
}>;
export type FilerConfig = z.infer<typeof FilerConfigSchema>;
//# sourceMappingURL=index.d.ts.map