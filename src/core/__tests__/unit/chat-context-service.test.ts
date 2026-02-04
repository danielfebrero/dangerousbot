/**
 * Unit tests for ChatContextService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMemory = {
  getSessionId: vi.fn().mockReturnValue('session-1'),
  getMessages: vi.fn().mockReturnValue([]),
  addMessage: vi.fn().mockReturnValue(1),
  setSessionId: vi.fn(),
};

vi.mock('../../memory.js', () => ({
  getMemory: vi.fn(() => mockMemory),
}));

const mockContextInjector = {
  injectContext: vi.fn().mockResolvedValue('## Injected Context'),
};

vi.mock('../../context-injector.js', () => ({
  getContextInjector: vi.fn(() => mockContextInjector),
}));

vi.mock('../../compressor.js', () => ({
  getCompressor: vi.fn(() => null),
}));

vi.mock('../../contextCleaner.js', () => ({
  cleanOldToolResults: vi.fn((msgs: any[]) => msgs),
}));

vi.mock('../../../config.js', () => ({
  PROVIDER: { ACTIVE: 'kimi' },
  MEMORY: { COMPRESSION_THRESHOLD: 50 },
}));

import { ChatContextService } from '../../chat-context-service.js';

describe('ChatContextService', () => {
  let service: ChatContextService;

  beforeEach(() => {
    mockMemory.getMessages.mockReset().mockReturnValue([]);
    mockMemory.addMessage.mockReset().mockReturnValue(1);
    mockMemory.getSessionId.mockReset().mockReturnValue('session-1');
    mockContextInjector.injectContext.mockReset().mockResolvedValue('## Injected Context');
    service = new ChatContextService();
  });

  describe('loadHistoryFromDatabase', () => {
    it('should return empty history when no messages', () => {
      const result = service.loadHistoryFromDatabase();
      expect(result.messages).toEqual([]);
      expect(result.messageCount).toBe(0);
    });

    it('should load simple text messages', () => {
      mockMemory.getMessages.mockReturnValue([
        { id: 1, role: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
        { id: 2, role: 'assistant', content: 'Hi back', timestamp: '2025-01-01T00:00:01Z' },
      ]);

      const result = service.loadHistoryFromDatabase();
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hello');
    });

    it('should reconstruct tool_result messages from __TOOL_RESULT__ prefix', () => {
      mockMemory.getMessages.mockReturnValue([
        {
          id: 1,
          role: 'assistant',
          content: 'Let me read the file',
          timestamp: '2025-01-01T00:00:00Z',
          tool_calls: [{ id: 'tc1', name: 'read_file', input: { path: '/test.ts' } }],
        },
        {
          id: 2,
          role: 'user',
          content: '__TOOL_RESULT__tc1__File content here',
          timestamp: '2025-01-01T00:00:01Z',
        },
      ]);

      const result = service.loadHistoryFromDatabase();
      expect(result.messages).toHaveLength(2);

      const toolResultMsg = result.messages[1];
      const blocks = toolResultMsg.content as any[];
      expect(blocks[0].type).toBe('tool_result');
      expect(blocks[0].tool_use_id).toBe('tc1');
      expect(blocks[0].content).toBe('File content here');
    });

    it('should reconstruct assistant messages with tool_calls', () => {
      mockMemory.getMessages.mockReturnValue([
        {
          id: 1,
          role: 'assistant',
          content: 'Reading file',
          timestamp: '2025-01-01',
          tool_calls: [{ id: 'tc1', name: 'read_file', input: { path: '/test.ts' } }],
        },
        {
          id: 2,
          role: 'user',
          content: '__TOOL_RESULT__tc1__content',
          timestamp: '2025-01-01',
        },
      ]);

      const result = service.loadHistoryFromDatabase();
      const assistantMsg = result.messages[0];
      const blocks = assistantMsg.content as any[];
      expect(blocks[0].type).toBe('text');
      expect(blocks[0].text).toBe('Reading file');
      expect(blocks[1].type).toBe('tool_use');
      expect(blocks[1].name).toBe('read_file');
    });

    it('should skip empty messages', () => {
      mockMemory.getMessages.mockReturnValue([
        { id: 1, role: 'user', content: '', timestamp: '2025-01-01' },
        { id: 2, role: 'user', content: 'Real message', timestamp: '2025-01-01' },
      ]);

      const result = service.loadHistoryFromDatabase();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Real message');
    });

    it('should reconstruct image messages', () => {
      mockMemory.getMessages.mockReturnValue([
        {
          id: 1,
          role: 'user',
          content: 'Look at this',
          timestamp: '2025-01-01',
          images: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } }],
        },
      ]);

      const result = service.loadHistoryFromDatabase();
      const blocks = result.messages[0].content as any[];
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('text');
      expect(blocks[1].type).toBe('image');
    });
  });

  describe('formatHistoryForAPI', () => {
    it('should filter empty string messages', () => {
      const messages = [
        { role: 'user' as const, content: '', timestamp: '2025-01-01' },
        { role: 'user' as const, content: 'Hello', timestamp: '2025-01-01' },
      ];

      const result = service.formatHistoryForAPI(messages);
      expect(result).toHaveLength(1);
    });

    it('should add timestamps to messages', () => {
      const messages = [
        { role: 'user' as const, content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
      ];

      const result = service.formatHistoryForAPI(messages);
      expect(result[0].content).toContain('[Timestamp:');
    });

    it('should filter empty array messages', () => {
      const messages = [
        { role: 'assistant' as const, content: [] as any[], timestamp: '2025-01-01' },
        { role: 'user' as const, content: 'Hello', timestamp: '2025-01-01' },
      ];

      const result = service.formatHistoryForAPI(messages);
      expect(result).toHaveLength(1);
    });
  });

  describe('buildSystemPrompt', () => {
    it('should return string with source info', async () => {
      const prompt = await service.buildSystemPrompt('Hello', 'webapp');
      expect(prompt).toContain('webapp');
    });

    it('should add Telegram-specific instructions', async () => {
      const prompt = await service.buildSystemPrompt('Hello', 'telegram');
      expect(prompt).toContain('Telegram');
      expect(prompt).toContain('concise');
    });

    it('should inject context', async () => {
      const prompt = await service.buildSystemPrompt('Hello', 'webapp');
      expect(prompt).toContain('Injected Context');
    });
  });

  describe('buildContext', () => {
    it('should return complete context object', async () => {
      const result = await service.buildContext('Hello', 'webapp');
      expect(result.systemPrompt).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.contextInjected).toBe(true);
    });

    it('should include system message and user message', async () => {
      const result = await service.buildContext('Hello', 'webapp');
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[result.messages.length - 1].role).toBe('user');
    });

    it('should include images in user message', async () => {
      const images = [{
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/png', data: 'abc123' },
      }];

      const result = await service.buildContext('Look at this', 'webapp', undefined, images);
      const lastMsg = result.messages[result.messages.length - 1];
      expect(Array.isArray(lastMsg.content)).toBe(true);
    });
  });

  describe('saveUserMessage', () => {
    it('should call memory.addMessage with user role', () => {
      service.saveUserMessage('Hello', undefined, 'webapp');
      expect(mockMemory.addMessage).toHaveBeenCalledWith(
        'user', 'Hello', undefined, undefined, 'webapp', undefined
      );
    });

    it('should set sessionId when provided', () => {
      service.saveUserMessage('Hello', undefined, 'webapp', 'session-2');
      expect(mockMemory.setSessionId).toHaveBeenCalledWith('session-2');
    });
  });

  describe('saveAssistantMessage', () => {
    it('should call memory.addMessage with assistant role', () => {
      service.saveAssistantMessage('Bot response', 'webapp');
      expect(mockMemory.addMessage).toHaveBeenCalledWith(
        'assistant', 'Bot response', undefined, undefined, 'webapp', undefined
      );
    });
  });
});
