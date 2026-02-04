/**
 * Unit tests for Brain
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock objects must be declared with vi.hoisted() so they're available in vi.mock factories
const { mockHistoryManager, mockProviderManager, mockPromptBuilder } = vi.hoisted(() => ({
  mockHistoryManager: {
    addUserMessage: vi.fn(),
    addAssistantMessage: vi.fn(),
    addToolResult: vi.fn(),
    getHistoryForAPI: vi.fn().mockReturnValue([]),
    getHistory: vi.fn().mockReturnValue([]),
    getMessageCount: vi.fn().mockReturnValue(0),
    loadFromDatabase: vi.fn(),
    setThreadId: vi.fn(),
    clear: vi.fn(),
    isNewSession: vi.fn().mockReturnValue(true),
  },
  mockProviderManager: {
    chatWithFallback: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Response' }],
      stopReason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost: { input_cost: 0.001, output_cost: 0.005, total_cost: 0.006 },
    }),
    chatStreamWithFallback: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Stream response' }],
      stopReason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost: { input_cost: 0.001, output_cost: 0.005, total_cost: 0.006 },
    }),
    switchProvider: vi.fn(),
    getCurrentProvider: vi.fn().mockReturnValue({ name: 'kimi', model: 'k2.5' }),
    setKimiApiKey: vi.fn(),
    setOpenRouterApiKey: vi.fn(),
    getOrCreateProvider: vi.fn(),
  },
  mockPromptBuilder: {
    updateWithContext: vi.fn().mockResolvedValue(undefined),
    getSystemPrompt: vi.fn().mockReturnValue('System prompt'),
    enableContext: vi.fn(),
    getBaseIdentity: vi.fn().mockReturnValue('Identity'),
    isContextEnabled: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../../prompt-builder.js', () => ({
  PromptBuilder: vi.fn(() => mockPromptBuilder),
}));

vi.mock('../../provider-manager.js', () => ({
  ProviderManager: vi.fn(() => mockProviderManager),
}));

vi.mock('../../history-manager.js', () => ({
  HistoryManager: vi.fn(() => mockHistoryManager),
}));

vi.mock('../../../embedding.js', () => ({
  initEmbeddingService: vi.fn(),
}));

vi.mock('../../../compressor.js', () => ({
  initCompressor: vi.fn(),
}));

vi.mock('../../../../config.js', () => ({
  APIS: { KIMI_API_KEY: 'test-kimi-key' },
  PROVIDER: { ACTIVE: 'kimi' },
}));

vi.mock('../../../thread-manager.js', () => ({
  getThreadManager: vi.fn(() => ({
    getThreadProvider: vi.fn().mockReturnValue(null),
  })),
}));

import { Brain } from '../../index.js';
import { getThreadManager } from '../../../thread-manager.js';

describe('Brain', () => {
  let brain: Brain;

  beforeEach(() => {
    Object.values(mockHistoryManager).forEach(fn => (fn as any).mockClear?.());
    Object.values(mockProviderManager).forEach(fn => (fn as any).mockClear?.());
    Object.values(mockPromptBuilder).forEach(fn => (fn as any).mockClear?.());
    mockHistoryManager.getHistoryForAPI.mockReturnValue([]);
    mockHistoryManager.getHistory.mockReturnValue([]);
    mockHistoryManager.isNewSession.mockReturnValue(true);
    mockProviderManager.chatWithFallback.mockResolvedValue({
      content: [{ type: 'text', text: 'Response' }],
      stopReason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost: { input_cost: 0.001, output_cost: 0.005, total_cost: 0.006 },
    });
    mockProviderManager.chatStreamWithFallback.mockResolvedValue({
      content: [{ type: 'text', text: 'Stream response' }],
      stopReason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost: { input_cost: 0.001, output_cost: 0.005, total_cost: 0.006 },
    });
    brain = new Brain('test-api-key');
  });

  describe('constructor', () => {
    it('should create PromptBuilder and ProviderManager', () => {
      // Brain constructor creates both
      expect(brain).toBeDefined();
    });
  });

  describe('switchProvider', () => {
    it('should delegate to providerManager', () => {
      brain.switchProvider('claude');
      expect(mockProviderManager.switchProvider).toHaveBeenCalledWith('claude');
    });
  });

  describe('getCurrentProvider', () => {
    it('should delegate to providerManager', () => {
      const result = brain.getCurrentProvider();
      expect(result).toEqual({ name: 'kimi', model: 'k2.5' });
    });
  });

  describe('setKimiApiKey', () => {
    it('should delegate to providerManager', () => {
      brain.setKimiApiKey('new-key');
      expect(mockProviderManager.setKimiApiKey).toHaveBeenCalledWith('new-key');
    });
  });

  describe('think', () => {
    it('should process a message and return formatted response', async () => {
      const tools = [{ name: 'test_tool', description: 'A test tool', input_schema: { type: 'object' as const, properties: {} } }];

      const result = await brain.think('Hello', tools, undefined, undefined, 'webapp', 'thread-1');

      expect(mockHistoryManager.addUserMessage).toHaveBeenCalledWith('Hello', undefined);
      expect(mockPromptBuilder.updateWithContext).toHaveBeenCalledWith('Hello', 'thread-1');
      expect(mockProviderManager.chatWithFallback).toHaveBeenCalled();
      expect(mockHistoryManager.addAssistantMessage).toHaveBeenCalled();
      expect(result.content).toBeDefined();
      expect(result.stopReason).toBe('end_turn');
    });

    it('should format tools for API', async () => {
      const tools = [{
        name: 'read_file',
        description: 'Read a file',
        input_schema: { type: 'object' as const, properties: { path: { type: 'string' } }, required: ['path'] },
      }];

      await brain.think('Read test.ts', tools);

      const callArgs = mockProviderManager.chatWithFallback.mock.calls[0];
      expect(callArgs[1].tools).toEqual([{
        name: 'read_file',
        description: 'Read a file',
        input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      }]);
    });
  });

  describe('thinkStream', () => {
    it('should process a message with streaming', async () => {
      const onChunk = vi.fn();

      const result = await brain.thinkStream('Hello', [], undefined, undefined, onChunk, 'webapp', 'thread-1');

      expect(mockHistoryManager.addUserMessage).toHaveBeenCalledWith('Hello', undefined);
      expect(mockProviderManager.chatStreamWithFallback).toHaveBeenCalled();
      expect(result.content).toBeDefined();
    });

    it('should pass onChunk callback to provider', async () => {
      const onChunk = vi.fn();
      await brain.thinkStream('Hello', [], undefined, undefined, onChunk, 'webapp', 'thread-1');

      const callArgs = mockProviderManager.chatStreamWithFallback.mock.calls[0];
      expect(callArgs[1].onChunk).toBe(onChunk);
    });
  });

  describe('continueAfterTool', () => {
    it('should continue with the same history manager', async () => {
      await brain.think('Hello', [], undefined, undefined, undefined, 'thread-1');
      await brain.continueAfterTool([], undefined, 'thread-1');
      expect(mockProviderManager.chatWithFallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('continueAfterToolStream', () => {
    it('should continue with streaming', async () => {
      const onChunk = vi.fn();
      await brain.thinkStream('Hello', [], undefined, undefined, onChunk, 'webapp', 'thread-1');
      await brain.continueAfterToolStream([], undefined, onChunk, 'thread-1');
      expect(mockProviderManager.chatStreamWithFallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('addToolResult', () => {
    it('should add tool result to history manager', () => {
      brain.addToolResult('tool-id-1', 'Result text', 'thread-1', 'exec-123');
      expect(mockHistoryManager.addToolResult).toHaveBeenCalledWith('tool-id-1', 'Result text', 'exec-123');
    });
  });

  describe('loadHistory', () => {
    it('should load history for a thread', () => {
      brain.loadHistory('thread-1');
      expect(mockHistoryManager.loadFromDatabase).toHaveBeenCalled();
    });

    it('should do nothing without threadId', () => {
      brain.loadHistory();
      // No error thrown
    });
  });

  describe('clearHistory', () => {
    it('should clear history for a specific thread', () => {
      brain.loadHistory('thread-1');
      brain.clearHistory('thread-1');
    });

    it('should clear all history when no threadId', () => {
      brain.clearHistory();
    });
  });

  describe('getHistory', () => {
    it('should return history for a thread', () => {
      mockHistoryManager.getHistory.mockReturnValue([
        { role: 'user', content: 'Hello' },
      ]);
      const history = brain.getHistory('thread-1');
      expect(history).toHaveLength(1);
    });

    it('should return empty array without threadId', () => {
      const history = brain.getHistory();
      expect(history).toEqual([]);
    });
  });

  describe('isNewSession', () => {
    it('should return true without threadId', () => {
      expect(brain.isNewSession()).toBe(true);
    });

    it('should delegate to history manager for a thread', () => {
      mockHistoryManager.isNewSession.mockReturnValue(false);
      expect(brain.isNewSession('thread-1')).toBe(false);
    });
  });

  describe('releaseHistoryManager', () => {
    it('should release the history manager for a thread', () => {
      brain.loadHistory('thread-1');
      brain.releaseHistoryManager('thread-1');
    });
  });

  describe('resolveProviderForThread', () => {
    it('should return thread provider if available', () => {
      vi.mocked(getThreadManager).mockReturnValue({
        getThreadProvider: vi.fn().mockReturnValue('claude'),
      } as any);

      const result = brain.resolveProviderForThread('thread-1');
      expect(result).toBe('claude');
    });

    it('should return global provider when thread has no provider', () => {
      vi.mocked(getThreadManager).mockReturnValue({
        getThreadProvider: vi.fn().mockReturnValue(null),
      } as any);

      const result = brain.resolveProviderForThread('thread-1');
      expect(result).toBe('kimi');
    });

    it('should return global provider when no threadId', () => {
      const result = brain.resolveProviderForThread();
      expect(result).toBe('kimi');
    });
  });

  describe('formatResponse', () => {
    it('should format text blocks correctly', async () => {
      mockProviderManager.chatWithFallback.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello world' }],
        stopReason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
        cost: { input_cost: 0.0001, output_cost: 0.0005, total_cost: 0.0006 },
      });

      const result = await brain.think('Hi', []);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello world' });
    });

    it('should format tool_use blocks correctly', async () => {
      mockProviderManager.chatWithFallback.mockResolvedValue({
        content: [
          { type: 'text', text: 'Let me read that' },
          { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: '/test.ts' } },
        ],
        stopReason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const result = await brain.think('Read test.ts', []);
      expect(result.content).toHaveLength(2);
      expect(result.content[1]).toEqual({
        type: 'tool_use',
        id: 'tc1',
        name: 'read_file',
        input: { path: '/test.ts' },
      });
      expect(result.stopReason).toBe('tool_use');
    });

    it('should handle unknown block types as empty text', async () => {
      mockProviderManager.chatWithFallback.mockResolvedValue({
        content: [{ type: 'unknown_type' }],
        stopReason: 'end_turn',
      });

      const result = await brain.think('Hi', []);
      expect(result.content[0]).toEqual({ type: 'text', text: '' });
    });
  });

  describe('initContextSystem', () => {
    it('should initialize embedding and compressor', () => {
      brain.initContextSystem('openrouter-key', 'anthropic-key');
      expect(mockProviderManager.setOpenRouterApiKey).toHaveBeenCalledWith('openrouter-key');
      expect(mockPromptBuilder.enableContext).toHaveBeenCalled();
    });
  });

  describe('LRU eviction of history managers', () => {
    it('should handle many history managers without error', async () => {
      for (let i = 0; i < 101; i++) {
        brain.loadHistory(`thread-${i}`);
      }
      brain.loadHistory('thread-101');
      // No errors should be thrown
    });
  });
});
