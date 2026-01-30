/**
 * brain.ts - L'interface avec Claude API
 * C'est le cerveau de DangerousBot
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { Memory, ThinkResponse, ThinkWithToolsResponse, Tool } from './types';

export class Brain {
  private client: Anthropic;
  private conversationHistory: Anthropic.MessageParam[] = [];
  private identity: string;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
    this.identity = this.loadIdentity();
  }

  private loadIdentity(): string {
    const identityPath = path.join(__dirname, '..', '..', 'identity', 'instructions.md');
    return fs.readFileSync(identityPath, 'utf-8');
  }

  async think(userMessage: string, systemContext: string = ''): Promise<ThinkResponse> {
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    const systemPrompt = this.identity + (systemContext ? '\n\n---\n\n' + systemContext : '');

    const response = await this.client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 8096,
      system: systemPrompt,
      messages: this.conversationHistory
    });

    const assistantMessage = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    this.conversationHistory.push({
      role: 'assistant',
      content: assistantMessage
    });

    return {
      text: assistantMessage,
      stopReason: response.stop_reason,
      usage: response.usage
    };
  }

  async thinkWithTools(
    userMessage: string,
    tools: Tool[],
    systemContext: string = ''
  ): Promise<ThinkWithToolsResponse> {
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    const systemPrompt = this.identity + (systemContext ? '\n\n---\n\n' + systemContext : '');

    const response = await this.client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 8096,
      system: systemPrompt,
      tools: tools as Anthropic.Tool[],
      messages: this.conversationHistory
    });

    this.conversationHistory.push({
      role: 'assistant',
      content: response.content
    });

    return {
      content: response.content,
      stopReason: response.stop_reason,
      usage: response.usage
    };
  }

  addToolResult(toolUseId: string, result: string): void {
    this.conversationHistory.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result
      }]
    });
  }

  getHistory(): Anthropic.MessageParam[] {
    return this.conversationHistory;
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  exportMemory(): Memory {
    return {
      history: this.conversationHistory,
      timestamp: new Date().toISOString()
    };
  }

  importMemory(memory: Memory): void {
    if (memory && memory.history) {
      this.conversationHistory = memory.history;
    }
  }
}
