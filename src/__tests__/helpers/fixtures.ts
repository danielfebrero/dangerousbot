/**
 * Test Fixtures - Reusable test data factories
 */

import type { AIMessage, AIContentBlock, AIToolUseContent, AIToolResultContent, AITextContent } from '../../core/providers/types.js';

export function createUserMessage(text: string, timestamp?: string): AIMessage {
  return {
    role: 'user',
    content: text,
    timestamp: timestamp ?? new Date().toISOString(),
  };
}

export function createAssistantMessage(text: string, timestamp?: string): AIMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    timestamp: timestamp ?? new Date().toISOString(),
  };
}

export function createAssistantTextBlock(text: string): AITextContent {
  return { type: 'text', text };
}

export function createToolUseBlock(name: string, input: unknown, id?: string): AIToolUseContent {
  return {
    type: 'tool_use',
    id: id ?? `tool_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    input,
  };
}

export function createToolResultBlock(toolUseId: string, content: string): AIToolResultContent {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
  };
}

export function createAssistantWithToolUse(
  text: string,
  toolName: string,
  toolInput: unknown,
  toolId?: string
): AIMessage {
  const blocks: AIContentBlock[] = [];
  if (text) {
    blocks.push(createAssistantTextBlock(text));
  }
  blocks.push(createToolUseBlock(toolName, toolInput, toolId));
  return {
    role: 'assistant',
    content: blocks,
    timestamp: new Date().toISOString(),
  };
}

export function createToolResultMessage(toolUseId: string, result: string): AIMessage {
  return {
    role: 'user',
    content: [createToolResultBlock(toolUseId, result)],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Seed a database with test messages.
 * Expects a better-sqlite3 Database instance with the conversations table.
 */
export function seedDatabase(
  db: any,
  messages: Array<{
    threadId?: string;
    sessionId?: string;
    role: string;
    content: string;
    toolCalls?: string;
    source?: string;
  }>
): void {
  const insert = db.prepare(`
    INSERT INTO conversations (thread_id, session_id, role, content, tool_calls, source, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const msg of messages) {
    insert.run(
      msg.threadId ?? 'test-thread',
      msg.sessionId ?? 'test-session',
      msg.role,
      msg.content,
      msg.toolCalls ?? null,
      msg.source ?? 'webapp'
    );
  }
}
