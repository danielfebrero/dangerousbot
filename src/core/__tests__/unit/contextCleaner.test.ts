/**
 * Unit tests for contextCleaner
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tool-result-store before importing
vi.mock('../../tool-result-store', () => ({
  getToolResultStore: vi.fn(() => ({
    getToolExecution: vi.fn().mockReturnValue(null),
    formatToolSummary: vi.fn().mockReturnValue(null),
  })),
}));

import { cleanOldToolResults, THRESHOLDS } from '../../contextCleaner.js';

describe('cleanOldToolResults', () => {
  describe('THRESHOLDS', () => {
    it('should export expected threshold values', () => {
      expect(THRESHOLDS.MAX_LINES_FILE).toBe(50);
      expect(THRESHOLDS.MAX_CHARS_OUTPUT).toBe(1000);
      expect(THRESHOLDS.MAX_CHARS_SHELL).toBe(500);
      expect(THRESHOLDS.KEEP_RECENT_COUNT).toBe(2);
    });
  });

  describe('recent messages', () => {
    it('should keep the last N messages intact', () => {
      const messages = [
        { role: 'user' as const, content: 'old message' },
        { role: 'assistant' as const, content: 'old response' },
        { role: 'user' as const, content: 'recent message' },
        { role: 'assistant' as const, content: 'recent response' },
      ];

      const result = cleanOldToolResults(messages);
      // Last 2 messages should be unchanged
      expect(result[2]).toEqual(messages[2]);
      expect(result[3]).toEqual(messages[3]);
    });
  });

  describe('old messages without tool_results', () => {
    it('should keep string content messages as-is', () => {
      const messages = [
        { role: 'user' as const, content: 'old text message' },
        { role: 'user' as const, content: 'recent 1' },
        { role: 'assistant' as const, content: 'recent 2' },
      ];

      const result = cleanOldToolResults(messages);
      expect(result[0].content).toBe('old text message');
    });
  });

  describe('old messages with tool_results', () => {
    it('should truncate long tool results', () => {
      const longContent = 'x'.repeat(2000);
      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'tool_result', tool_use_id: 'id1', content: longContent },
          ],
        },
        { role: 'user' as const, content: 'recent 1' },
        { role: 'assistant' as const, content: 'recent 2' },
      ];

      const result = cleanOldToolResults(messages);
      const toolResult = (result[0].content as any[])[0];
      expect(toolResult.content.length).toBeLessThan(longContent.length);
      expect(toolResult.content).toContain('[tronqué]');
    });

    it('should keep short tool results intact', () => {
      const shortContent = 'Short result';
      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'tool_result', tool_use_id: 'id1', content: shortContent },
          ],
        },
        { role: 'user' as const, content: 'recent 1' },
        { role: 'assistant' as const, content: 'recent 2' },
      ];

      const result = cleanOldToolResults(messages);
      const toolResult = (result[0].content as any[])[0];
      expect(toolResult.content).toBe(shortContent);
    });

    it('should summarize file content exceeding line threshold', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'tool_result', tool_use_id: 'id1', content: lines },
          ],
        },
        { role: 'user' as const, content: 'recent 1' },
        { role: 'assistant' as const, content: 'recent 2' },
      ];

      const result = cleanOldToolResults(messages);
      const toolResult = (result[0].content as any[])[0];
      expect(toolResult.content).toContain('Fichier:');
      expect(toolResult.content).toContain('lignes');
    });

    it('should summarize shell outputs', () => {
      const shellOutput = '$ npm install\n' + 'x'.repeat(600);
      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'tool_result', tool_use_id: 'id1', content: shellOutput, tool_name: 'shell' },
          ],
        },
        { role: 'user' as const, content: 'recent 1' },
        { role: 'assistant' as const, content: 'recent 2' },
      ];

      const result = cleanOldToolResults(messages);
      const toolResult = (result[0].content as any[])[0];
      expect(toolResult.content).toContain('[tronqué');
      expect(toolResult.content.length).toBeLessThan(shellOutput.length);
    });

    it('should not modify non-tool_result blocks', () => {
      const messages = [
        {
          role: 'assistant' as const,
          content: [
            { type: 'text', text: 'Some text response' },
            { type: 'tool_use', id: 'id1', name: 'read_file', input: { path: '/test' } },
          ],
        },
        { role: 'user' as const, content: 'recent 1' },
        { role: 'assistant' as const, content: 'recent 2' },
      ];

      const result = cleanOldToolResults(messages);
      const blocks = result[0].content as any[];
      expect(blocks[0]).toEqual({ type: 'text', text: 'Some text response' });
      expect(blocks[1].type).toBe('tool_use');
    });
  });

  describe('edge cases', () => {
    it('should handle empty message array', () => {
      const result = cleanOldToolResults([]);
      expect(result).toEqual([]);
    });

    it('should handle messages with fewer than KEEP_RECENT_COUNT', () => {
      const messages = [
        { role: 'user' as const, content: 'only message' },
      ];
      const result = cleanOldToolResults(messages);
      expect(result[0].content).toBe('only message');
    });

    it('should use execution_id summary if available', async () => {
      const { getToolResultStore } = await import('../../tool-result-store');
      const mockStore = {
        getToolExecution: vi.fn().mockReturnValue({ id: 'exec-1', summary: 'File read successfully' }),
        formatToolSummary: vi.fn().mockReturnValue('[Summary] File: test.ts, 50 lines read'),
      };
      vi.mocked(getToolResultStore).mockReturnValue(mockStore);

      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'tool_result', tool_use_id: 'id1', content: 'x'.repeat(2000), execution_id: 'exec-1' },
          ],
        },
        { role: 'user' as const, content: 'recent 1' },
        { role: 'assistant' as const, content: 'recent 2' },
      ];

      const result = cleanOldToolResults(messages);
      const toolResult = (result[0].content as any[])[0];
      expect(toolResult.content).toBe('[Summary] File: test.ts, 50 lines read');
      // execution_id should be stripped from the output
      expect(toolResult.execution_id).toBeUndefined();
    });
  });
});
