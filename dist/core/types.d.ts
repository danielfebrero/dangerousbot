/**
 * Types pour DangerousBot
 */
import Anthropic from '@anthropic-ai/sdk';
export interface Message {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
}
export interface ContentBlock {
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    tool_use_id?: string;
    content?: string;
}
export interface ThinkResponse {
    text: string;
    stopReason: string | null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}
export interface ThinkWithToolsResponse {
    content: Anthropic.ContentBlock[];
    stopReason: string | null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}
export interface Memory {
    history: Anthropic.MessageParam[];
    timestamp: string;
}
export interface ExecutionResult {
    success: boolean;
    result?: unknown;
    logs?: Array<[string, ...unknown[]]>;
    error?: string;
    stack?: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    filePath?: string;
    [key: string]: unknown;
}
export interface ToolResult {
    success: boolean;
    error?: string;
    [key: string]: unknown;
}
export interface FileInfo {
    name: string;
    isDirectory: boolean;
    path: string;
}
export interface BasicSystemInfo {
    platform: NodeJS.Platform;
    arch: string;
    hostname: string;
    username: string;
    homeDir: string;
    tmpDir: string;
    cpus: number;
    totalMemory: string;
    freeMemory: string;
    uptime: string;
    nodeVersion: string;
    cwd: string;
}
export interface DiskSpace {
    filesystem?: string;
    size?: string;
    used?: string;
    available?: string;
    usePercent?: string;
    error?: string;
}
export interface NetworkStatus {
    internet: boolean;
    dns: boolean;
}
export interface ToolsAvailability {
    [tool: string]: boolean;
}
export interface SystemReport {
    basic: BasicSystemInfo;
    tools: ToolsAvailability;
    env: Record<string, string>;
    disk: DiskSpace | null;
    network: NetworkStatus;
    timestamp: string;
}
export interface Tool {
    name: string;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
        }>;
        required: string[];
    };
}
export interface Config {
    apiKey?: string;
    [key: string]: unknown;
}
//# sourceMappingURL=types.d.ts.map