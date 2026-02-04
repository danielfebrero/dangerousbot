/**
 * Unit tests for ContextInjector
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), getLevel: vi.fn().mockReturnValue('info') },
}));

const mockMemory = {
  getKnowledge: vi.fn().mockReturnValue([]),
};

vi.mock('../../memory', () => ({
  getMemory: vi.fn(() => mockMemory),
}));

const mockCompressor = {
  getCompressedMemories: vi.fn().mockReturnValue([]),
  checkAndCompress: vi.fn().mockResolvedValue(null),
};

vi.mock('../../compressor', () => ({
  getCompressor: vi.fn(() => mockCompressor),
}));

const mockEmbeddingService = {
  embed: vi.fn().mockResolvedValue({ vector: [1, 0, 0], tokenCount: 5 }),
};

vi.mock('../../embedding', () => ({
  getEmbeddingService: vi.fn(() => mockEmbeddingService),
  EmbeddingService: {
    cosineSimilarity: vi.fn().mockReturnValue(0.8),
    findTopK: vi.fn().mockReturnValue([]),
  },
}));

const mockThreadManager = {
  listThreads: vi.fn().mockReturnValue([]),
};

vi.mock('../../thread-manager.js', () => ({
  getThreadManager: vi.fn(() => mockThreadManager),
}));

vi.mock('../../../config.js', () => ({
  PROVIDER: { ACTIVE: 'kimi' },
}));

import { ContextInjector } from '../../context-injector.js';

describe('ContextInjector', () => {
  let injector: ContextInjector;

  beforeEach(() => {
    mockMemory.getKnowledge.mockReset().mockReturnValue([]);
    mockCompressor.getCompressedMemories.mockReset().mockReturnValue([]);
    mockEmbeddingService.embed.mockReset().mockResolvedValue({ vector: [1, 0, 0], tokenCount: 5 });
    mockThreadManager.listThreads.mockReset().mockReturnValue([]);

    injector = new ContextInjector();
  });

  describe('getRelevantContext', () => {
    it('should return empty context when no data', async () => {
      const context = await injector.getRelevantContext('Hello');
      expect(context.memories).toEqual([]);
      expect(context.knowledge).toEqual([]);
      expect(context.recentSummary).toBeUndefined();
    });

    it('should include knowledge', async () => {
      mockMemory.getKnowledge.mockReturnValue([
        { id: 1, type: 'fact', content: 'User likes TypeScript', created_at: '2025-01-01' },
      ]);

      const context = await injector.getRelevantContext('Hello');
      expect(context.knowledge).toHaveLength(1);
      expect(context.knowledge[0]).toContain('FACT');
      expect(context.knowledge[0]).toContain('TypeScript');
    });

    it('should include recent summary for current thread', async () => {
      mockCompressor.getCompressedMemories.mockReturnValue([
        {
          id: 1,
          session_id: 's1',
          thread_id: 'thread-1',
          summary: 'Previous conversation summary',
          message_ids: [1, 2, 3],
          start_time: '2025-01-01',
          end_time: '2025-01-01',
          embedding: [0.1, 0.2, 0.3],
        },
      ]);

      const context = await injector.getRelevantContext('Hello', 'thread-1');
      expect(context.recentSummary).toBe('Previous conversation summary');
    });
  });

  describe('formatContextBlock', () => {
    it('should format empty context', () => {
      const block = injector.formatContextBlock({
        memories: [],
        knowledge: [],
      });

      expect(block).toContain('CONTEXTE INJECTÉ');
      expect(block).toContain('Configuration Système');
    });

    it('should include knowledge section', () => {
      const block = injector.formatContextBlock({
        memories: [],
        knowledge: ['[FACT] User likes TypeScript'],
      });

      expect(block).toContain('Connaissances acquises');
      expect(block).toContain('TypeScript');
    });

    it('should include memories section', () => {
      const block = injector.formatContextBlock({
        memories: [
          {
            content: 'Previous conversation about React',
            threadId: 'thread-1',
            threadTitle: 'React Chat',
            isFromCurrentThread: false,
            similarity: 0.85,
          },
        ],
        knowledge: [],
      });

      expect(block).toContain('Mémoires de conversations');
      expect(block).toContain('React Chat');
    });

    it('should separate current and other thread memories', () => {
      const block = injector.formatContextBlock({
        memories: [
          {
            content: 'Current thread memory',
            threadId: 'thread-1',
            threadTitle: 'Current',
            isFromCurrentThread: true,
            similarity: 0.9,
          },
          {
            content: 'Other thread memory',
            threadId: 'thread-2',
            threadTitle: 'Other',
            isFromCurrentThread: false,
            similarity: 0.8,
          },
        ],
        knowledge: [],
      }, 'Current');

      expect(block).toContain('De cette conversation');
      expect(block).toContain('autres conversations');
    });

    it('should include recent summary', () => {
      const block = injector.formatContextBlock({
        memories: [],
        knowledge: [],
        recentSummary: 'Summary of recent discussion',
      });

      expect(block).toContain('Résumé de cette conversation');
      expect(block).toContain('Summary of recent discussion');
    });
  });

  describe('injectContext', () => {
    it('should return formatted context string', async () => {
      const result = await injector.injectContext('Hello');
      expect(typeof result).toBe('string');
      expect(result).toContain('CONTEXTE INJECTÉ');
    });
  });

  describe('maybeCompress', () => {
    it('should return false when compressor returns null', async () => {
      mockCompressor.checkAndCompress.mockResolvedValue(null);
      const result = await injector.maybeCompress();
      expect(result).toBe(false);
    });
  });
});
