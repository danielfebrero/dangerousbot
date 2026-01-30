/**
 * executor.ts - Exécution de code pour DangerousBot
 * Permet d'exécuter du code en mémoire ou via fichiers
 */
import { ExecutionResult, FileInfo } from './types';
interface ExecutionContext {
    logs?: Array<[string, ...unknown[]]>;
    [key: string]: unknown;
}
export declare class Executor {
    private workspacePath;
    constructor(workspacePath: string);
    private ensureWorkspace;
    executeInMemory(code: string, context?: ExecutionContext): Promise<ExecutionResult>;
    executeFile(filename: string, code: string, interpreter?: string): Promise<ExecutionResult>;
    shell(command: string, options?: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
    }): Promise<ExecutionResult>;
    writeFile(relativePath: string, content: string): string;
    readFile(relativePath: string): string | null;
    listFiles(relativePath?: string): FileInfo[];
    deleteFile(relativePath: string): boolean;
    getWorkspacePath(): string;
}
export {};
//# sourceMappingURL=executor.d.ts.map