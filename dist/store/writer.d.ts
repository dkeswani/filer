import { AnyNode, FilerIndex, FilerConfig } from '../schema/mod.js';
export declare function resolveRoot(cwd?: string): string;
export declare function filerDir(root: string): string;
export declare function nodeFilePath(root: string, node: AnyNode): string;
export declare function ensureFilerDirs(root: string): void;
export declare function writeNode(root: string, node: AnyNode): void;
export declare function writeNodes(root: string, nodes: AnyNode[]): void;
export declare function writeIndex(root: string, index: FilerIndex): void;
export declare function buildIndex(root: string, opts: {
    repo: string;
    llm: string;
    last_commit?: string;
    files_indexed: number;
}): FilerIndex;
export declare function writeConfig(root: string, config: FilerConfig): void;
export declare function readNode(root: string, id: string): AnyNode | null;
export declare function readAllNodes(root: string): AnyNode[];
export declare function readIndex(root: string): FilerIndex | null;
export declare function readConfig(root: string): FilerConfig | null;
export declare function filerExists(root: string): boolean;
export declare function indexExists(root: string): boolean;
export declare function upsertNode(root: string, incoming: AnyNode): {
    created: boolean;
};
export declare function markStale(root: string, scope: string[], increment?: number): number;
export declare function loadNodesForScope(root: string, filePaths: string[]): AnyNode[];
//# sourceMappingURL=writer.d.ts.map