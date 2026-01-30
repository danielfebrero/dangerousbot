/**
 * executor.ts - Exécution de code pour DangerousBot
 * Accès complet à la machine - pas de restrictions de workspace
 */
import * as fs from 'fs';
import { ExecutionResult, FileInfo } from './types';
interface ExecutionContext {
    logs?: Array<[string, ...unknown[]]>;
    [key: string]: unknown;
}
export declare class Executor {
    private homePath;
    constructor();
    private resolvePath;
    executeInMemory(code: string, context?: ExecutionContext): Promise<ExecutionResult>;
    executeFile(filePath: string, code: string, interpreter?: string): Promise<ExecutionResult>;
    shell(command: string, options?: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
    }): Promise<ExecutionResult>;
    writeFile(filePath: string, content: string): string;
    readFile(filePath: string): string | null;
    listFiles(dirPath?: string): FileInfo[];
    deleteFile(filePath: string): boolean;
    exists(filePath: string): boolean;
    stat(filePath: string): fs.Stats | null;
    mkdir(dirPath: string): boolean;
    copyFile(source: string, destination: string): boolean;
    moveFile(source: string, destination: string): boolean;
    getHomePath(): string;
}
export {};
//# sourceMappingURL=executor.d.ts.map