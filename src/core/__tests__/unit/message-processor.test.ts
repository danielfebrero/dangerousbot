/**
 * Unit tests for MessageProcessor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock ChatContextService
const mockContextService = {
  buildContext: vi.fn().mockResolvedValue({
    systemPrompt: 'You are a bot',
    messages: [{ role: 'user', content: 'Hello' }],
  }),
  saveUserMessage: vi.fn(),
  saveAssistantMessage: vi.fn(),
};

vi.mock('../../chat-context-service.js', () => ({
  getChatContextService: vi.fn(() => mockContextService),
}));

// Mock ProviderManager
const mockProviderManager = {
  chatWithFallback: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Bot response' }],
    usage: { input_tokens: 10, output_tokens: 20 },
  }),
};

vi.mock('../../brain/provider-manager.js', () => ({
  ProviderManager: vi.fn().mockImplementation(() => mockProviderManager),
}));

// Mock tool definitions
vi.mock('../../tools/index.js', () => ({
  getToolDefinitions: vi.fn(() => [
    { name: 'read_file', description: 'Read a file', input_schema: { type: 'object', properties: { path: { type: 'string' } } } },
  ]),
}));

// Mock ToolExecutor
vi.mock('../../tools.js', () => ({
  ToolExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ success: true, content: 'file content' }),
  })),
}));

import { MessageProcessor } from '../../message-processor.js';

describe('MessageProcessor', () => {
  let processor: MessageProcessor;

  beforeEach(() => {
    mockContextService.buildContext.mockReset().mockResolvedValue({
      systemPrompt: 'You are a bot',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    mockContextService.saveUserMessage.mockReset();
    mockContextService.saveAssistantMessage.mockReset();

    mockProviderManager.chatWithFallback.mockReset().mockResolvedValue({
      content: [{ type: 'text', text: 'Bot response' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    processor = new MessageProcessor({
      anthropicApiKey: 'test-key',
    });
  });

  describe('process', () => {
    it('should return text response for simple message', async () => {
      const result = await processor.process(
        { text: 'Hello' },
        { source: 'webapp' }
      );

      expect(result.text).toBe('Bot response');
      expect(result.toolCalls).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('should handle tool calls in response', async () => {
      // First call returns tool_use, second call returns text
      mockProviderManager.chatWithFallback
        .mockResolvedValueOnce({
          content: [
            { type: 'text', text: '' },
            { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: '/test.ts' } },
          ],
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Here is the file content' }],
        });

      const result = await processor.process(
        { text: 'Read test.ts' },
        { source: 'webapp' }
      );

      expect(result.text).toBe('Here is the file content');
      expect(result.toolCalls).toHaveLength(1);
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      // Provider returns tool_use but we're already aborted
      mockProviderManager.chatWithFallback.mockResolvedValue({
        content: [
          { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: '/test.ts' } },
        ],
      });

      const result = await processor.process(
        { text: 'Hello' },
        { source: 'webapp', abortSignal: controller.signal }
      );

      // Should have stopped early
      expect(result.text).toBe('');
    });

    it('should call callbacks during processing', async () => {
      const callbacks = {
        onProcessingStart: vi.fn(),
        onProcessingEnd: vi.fn(),
      };

      await processor.process(
        { text: 'Hello' },
        { source: 'webapp', callbacks }
      );

      expect(callbacks.onProcessingStart).toHaveBeenCalled();
      expect(callbacks.onProcessingEnd).toHaveBeenCalled();
    });

    it('should save messages when conversationId is provided', async () => {
      await processor.process(
        { text: 'Hello' },
        { source: 'webapp', conversationId: 'conv-1' }
      );

      expect(mockContextService.saveUserMessage).toHaveBeenCalled();
      expect(mockContextService.saveAssistantMessage).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockProviderManager.chatWithFallback.mockRejectedValue(new Error('Provider error'));

      const result = await processor.process(
        { text: 'Hello' },
        { source: 'webapp' }
      );

      expect(result.error).toBeDefined();
      expect(result.text).toBe('');
    });
  });
});
