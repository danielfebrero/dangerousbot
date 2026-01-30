/**
 * brain.ts - L'interface avec Claude API
 * C'est le cerveau de DangerousBot
 */
import Anthropic from '@anthropic-ai/sdk';
import { Memory, ThinkResponse, ThinkWithToolsResponse, Tool } from './types';
export declare class Brain {
    private client;
    private conversationHistory;
    private identity;
    constructor(apiKey: string);
    private loadIdentity;
    think(userMessage: string, systemContext?: string): Promise<ThinkResponse>;
    thinkWithTools(userMessage: string, tools: Tool[], systemContext?: string): Promise<ThinkWithToolsResponse>;
    addToolResult(toolUseId: string, result: string): void;
    getHistory(): Anthropic.MessageParam[];
    clearHistory(): void;
    exportMemory(): Memory;
    importMemory(memory: Memory): void;
}
//# sourceMappingURL=brain.d.ts.map