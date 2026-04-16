import type { FilerConfig } from '../schema/mod.js';
export interface SourceFile {
    path: string;
    absolutePath: string;
    content: string;
    sizeBytes: number;
}
export interface Module {
    path: string;
    name: string;
    files: SourceFile[];
    tokens: number;
}
export declare function scanFiles(root: string, config: FilerConfig): Promise<SourceFile[]>;
export declare function groupIntoModules(files: SourceFile[], config: FilerConfig): Module[];
export declare function getChangedFiles(root: string, since?: string): string[];
export declare function getCurrentCommit(root: string): string | undefined;
//# sourceMappingURL=scanner.d.ts.map