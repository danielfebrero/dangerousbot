/**
 * Unit tests for HistoryManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../memory', () => ({
  getMemory: vi.fn(() => ({
    getMessages: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../../thread-manager', () => ({
  getThreadManager: vi.fn(() => ({
    getThreadMessages: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../../contextCleaner', () => ({
  cleanOldToolResults: vi.fn((msgs) => msgs),
}));

import { HistoryManager } from '../../history-manager.js';
import { getThreadManager } from '../../../thread-manager.js';
import { cleanOldToolResults } from '../../../contextCleaner.js';

describe('HistoryManager', () => {
  let hm: HistoryManager;

  beforeEach(() => {
    hm = new HistoryManager();
  });

  describe('addUserMessage', () => {
    it('should add a text message', () => {
      hm.addUserMessage('Hello');
      const history = hm.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Hello');
    });

    it('should ignore empty messages without images', () => {
      hm.addUserMessage('');
      hm.addUserMessage('   ');
      expect(hm.getHistory()).toHaveLength(0);
    });

    it('should accept messages with images', () => {
      const images = [{
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/png', data: 'abc123' },
      }];
      hm.addUserMessage('Look at this', images);
      const history = hm.getHistory();
      expect(history).toHaveLength(1);
      expect(Array.isArray(history[0].content)).toBe(true);
      const blocks = history[0].content as any[];
      expect(blocks).toHaveLength(2); // text + image
      expect(blocks[0].type).toBe('text');
      expect(blocks[1].type).toBe('image');
    });

    it('should accept image-only messages', () => {
      const images = [{
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/png', data: 'abc123' },
      }];
      hm.addUserMessage('', images);
      const history = hm.getHistory();
      expect(history).toHaveLength(1);
      const blocks = history[0].content as any[];
      expect(blocks).toHaveLength(1); // image only (no empty text block)
    });

    it('should increment message count', () => {
      hm.addUserMessage('First');
      hm.addUserMessage('Second');
      expect(hm.getMessageCount()).toBe(2);
    });

    it('should include timestamp', () => {
      hm.addUserMessage('Hello');
      const msg = hm.getHistory()[0];
      expect(msg.timestamp).toBeDefined();
      expect(new Date(msg.timestamp!).getTime()).not.toBeNaN();
    });
  });

  describe('addAssistantMessage', () => {
    it('should add content blocks', () => {
      hm.addAssistantMessage([{ type: 'text', text: 'Hello back' }]);
      const history = hm.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('assistant');
    });

    it('should ignore empty content', () => {
      hm.addAssistantMessage([]);
      hm.addAssistantMessage(null as any);
      expect(hm.getHistory()).toHaveLength(0);
    });
  });

  describe('addToolResult', () => {
    it('should add tool result as user message', () => {
      hm.addToolResult('tool-id-1', 'Tool output');
      const history = hm.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('user');
      const blocks = history[0].content as any[];
      expect(blocks[0].type).toBe('tool_result');
      expect(blocks[0].tool_use_id).toBe('tool-id-1');
      expect(blocks[0].content).toBe('Tool output');
    });

    it('should include execution_id when provided', () => {
      hm.addToolResult('tool-id-1', 'Output', 'exec-123');
      const blocks = hm.getHistory()[0].content as any[];
      expect(blocks[0].execution_id).toBe('exec-123');
    });
  });

  describe('getHistoryForAPI', () => {
    it('should call cleanOldToolResults', () => {
      hm.addUserMessage('Hello');
      hm.getHistoryForAPI();
      expect(cleanOldToolResults).toHaveBeenCalled();
    });

    it('should filter out empty string messages', () => {
      // Directly push an empty message to test filtering
      (hm as any).conversationHistory.push(
        { role: 'user', content: '', timestamp: new Date().toISOString() }
      );
      hm.addUserMessage('Real message');
      const api = hm.getHistoryForAPI();
      expect(api).toHaveLength(1);
      expect(api[0].content).toContain('Real message');
    });

    it('should filter out empty array messages', () => {
      (hm as any).conversationHistory.push(
        { role: 'assistant', content: [], timestamp: new Date().toISOString() }
      );
      hm.addUserMessage('Real message');
      const api = hm.getHistoryForAPI();
      expect(api).toHaveLength(1);
    });

    it('should add timestamps to messages', () => {
      hm.addUserMessage('Hello');
      const api = hm.getHistoryForAPI();
      expect(api[0].content).toContain('[Timestamp:');
    });
  });

  describe('getCleanedHistory', () => {
    it('should filter empty messages without adding timestamps', () => {
      hm.addUserMessage('Hello');
      const cleaned = hm.getCleanedHistory();
      expect(cleaned).toHaveLength(1);
      // getCleanedHistory does NOT add timestamps
      expect(cleaned[0].content).toBe('Hello');
    });
  });

  describe('setThreadId', () => {
    it('should reset history when switching threads', () => {
      hm.setThreadId('thread-1');
      hm.addUserMessage('Message in thread 1');
      expect(hm.getHistory()).toHaveLength(1);

      hm.setThreadId('thread-2');
      expect(hm.getHistory()).toHaveLength(0);
      expect(hm.getMessageCount()).toBe(0);
    });

    it('should not reset history when setting same thread', () => {
      hm.setThreadId('thread-1');
      hm.addUserMessage('Message');
      hm.setThreadId('thread-1');
      expect(hm.getHistory()).toHaveLength(1);
    });
  });

  describe('loadFromDatabase', () => {
    it('should warn if no thread ID is set', () => {
      const warnSpy = vi.spyOn(console, 'warn');
      hm.loadFromDatabase();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No thread ID')
      );
    });

    it('should load messages from thread manager', () => {
      vi.mocked(getThreadManager).mockReturnValue({
        getThreadMessages: vi.fn().mockReturnValue([
          { role: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
          { role: 'assistant', content: 'Hi', timestamp: '2025-01-01T00:00:01Z' },
        ]),
      } as any);

      hm.setThreadId('thread-1');
      hm.loadFromDatabase();
      expect(hm.getHistory()).toHaveLength(2);
    });

    it('should reconstruct tool_result messages from __TOOL_RESULT__ prefix', () => {
      // Provide a complete tool chain: assistant with tool_use + user with tool_result
      vi.mocked(getThreadManager).mockReturnValue({
        getThreadMessages: vi.fn().mockReturnValue([
          {
            role: 'assistant',
            content: 'Let me read that file',
            timestamp: '2025-01-01T00:00:00Z',
            toolCalls: [
              { id: 'read_file', name: 'read_file', input: { path: '/test.ts' } },
            ],
          },
          {
            role: 'user',
            content: '__TOOL_RESULT__read_file__File content here',
            timestamp: '2025-01-01T00:00:01Z',
          },
        ]),
      } as any);

      hm.setThreadId('thread-1');
      hm.loadFromDatabase();
      const history = hm.getHistory();
      expect(history).toHaveLength(2);
      // Check the tool_result message
      const toolResultMsg = history[1];
      const blocks = toolResultMsg.content as any[];
      expect(blocks[0].type).toBe('tool_result');
      expect(blocks[0].tool_use_id).toBe('read_file');
      expect(blocks[0].content).toBe('File content here');
    });

    it('should reconstruct assistant messages with toolCalls', () => {
      // Provide a complete tool chain: assistant with tool_use + user with matching tool_result
      vi.mocked(getThreadManager).mockReturnValue({
        getThreadMessages: vi.fn().mockReturnValue([
          {
            role: 'assistant',
            content: 'Let me read that file',
            timestamp: '2025-01-01T00:00:00Z',
            toolCalls: [
              { id: 'tc1', name: 'read_file', input: { path: '/test.ts' } },
            ],
          },
          {
            role: 'user',
            content: '__TOOL_RESULT__tc1__File content here',
            timestamp: '2025-01-01T00:00:01Z',
          },
        ]),
      } as any);

      hm.setThreadId('thread-1');
      hm.loadFromDatabase();
      const history = hm.getHistory();
      expect(history).toHaveLength(2);
      const blocks = history[0].content as any[];
      expect(blocks[0].type).toBe('text');
      expect(blocks[1].type).toBe('tool_use');
      expect(blocks[1].name).toBe('read_file');
    });

    it('should skip empty messages', () => {
      vi.mocked(getThreadManager).mockReturnValue({
        getThreadMessages: vi.fn().mockReturnValue([
          { role: 'user', content: '', timestamp: '2025-01-01T00:00:00Z' },
          { role: 'user', content: 'Real message', timestamp: '2025-01-01T00:00:01Z' },
        ]),
      } as any);

      hm.setThreadId('thread-1');
      hm.loadFromDatabase();
      expect(hm.getHistory()).toHaveLength(1);
    });
  });

  describe('validateToolChains', () => {
    it('should remove orphaned tool_results', () => {
      vi.mocked(getThreadManager).mockReturnValue({
        getThreadMessages: vi.fn().mockReturnValue([
          {
            role: 'user',
            content: '__TOOL_RESULT__nonexistent_id__Some result',
            timestamp: '2025-01-01T00:00:00Z',
          },
        ]),
      } as any);

      hm.setThreadId('thread-1');
      hm.loadFromDatabase();
      // Orphaned tool_result should be removed
      expect(hm.getHistory()).toHaveLength(0);
    });

    it('should remove unresolved tool_use blocks', () => {
      vi.mocked(getThreadManager).mockReturnValue({
        getThreadMessages: vi.fn().mockReturnValue([
          {
            role: 'assistant',
            content: '',
            timestamp: '2025-01-01T00:00:00Z',
            toolCalls: [
              { id: 'tc_no_result', name: 'read_file', input: {} },
            ],
          },
        ]),
      } as any);

      hm.setThreadId('thread-1');
      hm.loadFromDatabase();
      // Message with only an unresolved tool_use should be removed
      expect(hm.getHistory()).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all history', () => {
      hm.addUserMessage('Hello');
      hm.addUserMessage('World');
      hm.clear();
      expect(hm.getHistory()).toHaveLength(0);
      expect(hm.getMessageCount()).toBe(0);
    });
  });

  describe('isNewSession', () => {
    it('should return true when no messages', () => {
      expect(hm.isNewSession()).toBe(true);
    });

    it('should return false after adding a message', () => {
      hm.addUserMessage('Hello');
      expect(hm.isNewSession()).toBe(false);
    });
  });
});
