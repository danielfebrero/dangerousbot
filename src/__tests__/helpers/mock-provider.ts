/**
 * Mock AI Provider - Reusable mock implementing the AIProvider interface
 */

import { vi } from 'vitest';
import type { AIProvider, AIResponse, AIMessage, AIToolDefinition, StreamCallback } from '../../core/providers/types.js';

const DEFAULT_RESPONSE: AIResponse = {
  content: [{ type: 'text', text: 'Mock response' }],
  stopReason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 50 },
  cost: { input_cost: 0.001, output_cost: 0.005, total_cost: 0.006 },
};

interface MockProviderOptions {
  name?: string;
  model?: string;
  response?: AIResponse;
  streamChunks?: Array<{ type: 'text'; text: string }>;
  supportsTools?: boolean;
}

export function createMockProvider(options: MockProviderOptions = {}): AIProvider & {
  chat: ReturnType<typeof vi.fn>;
  chatStream: ReturnType<typeof vi.fn>;
} {
  const response = options.response ?? DEFAULT_RESPONSE;
  const streamChunks = options.streamChunks ?? [{ type: 'text' as const, text: 'Mock response' }];

  const provider = {
    name: options.name ?? 'mock',
    model: options.model ?? 'mock-model',

    chat: vi.fn().mockResolvedValue(response),

    chatStream: vi.fn().mockImplementation(
      async (
        _messages: AIMessage[],
        opts: { onChunk: StreamCallback }
      ) => {
        for (const chunk of streamChunks) {
          opts.onChunk(chunk);
        }
        return response;
      }
    ),

    supportsTools: vi.fn().mockReturnValue(options.supportsTools ?? true),
  };

  return provider;
}
