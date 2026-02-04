/**
 * Unit tests for MemoryCompressor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockMemory = {
  getSessionId: vi.fn().mockReturnValue('session-1'),
  getMessages: vi.fn().mockReturnValue([]),
  db: {
    prepare: vi.fn().mockReturnThis(),
    run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }),
    all: vi.fn().mockReturnValue([]),
    get: vi.fn(),
  },
};

vi.mock('../../memory', () => ({
  getMemory: vi.fn(() => mockMemory),
}));

const mockEmbeddingService = {
  embed: vi.fn().mockResolvedValue({ vector: [0.1, 0.2, 0.3], tokenCount: 10 }),
};

vi.mock('../../embedding', () => ({
  getEmbeddingService: vi.fn(() => mockEmbeddingService),
  EmbeddingService: {
    findTopK: vi.fn().mockReturnValue([]),
    cosineSimilarity: vi.fn().mockReturnValue(0.9),
  },
}));

vi.mock('../../../config', () => ({
  MODELS: { KIMI: 'k2-0711' },
  TOKENS: { MAX_COMPRESSION_SUMMARY: 2000 },
  MEMORY: { RELEVANT_MEMORIES_TOP_K: 3 },
}));

// Mock KimiProvider
vi.mock('../../providers/kimi.js', () => ({
  KimiProvider: vi.fn().mockImplementation(() => ({
    chat: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Summary of conversation' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  })),
}));

import { MemoryCompressor } from '../../compressor.js';

describe('MemoryCompressor', () => {
  let compressor: MemoryCompressor;

  beforeEach(() => {
    mockMemory.getMessages.mockReset().mockReturnValue([]);
    mockMemory.getSessionId.mockReset().mockReturnValue('session-1');
    mockMemory.db.prepare.mockReturnThis();
    mockMemory.db.run.mockReturnValue({ lastInsertRowid: 1 });
    mockMemory.db.all.mockReturnValue([]);
    mockEmbeddingService.embed.mockReset().mockResolvedValue({ vector: [0.1, 0.2, 0.3], tokenCount: 10 });

    compressor = new MemoryCompressor('test-kimi-key');
  });

  describe('compressSession', () => {
    it('should return null when no messages', async () => {
      mockMemory.getMessages.mockReturnValue([]);
      const result = await compressor.compressSession();
      expect(result).toBeNull();
    });

    it('should compress messages into a summary', async () => {
      mockMemory.getMessages.mockReturnValue([
        { id: 1, role: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
        { id: 2, role: 'assistant', content: 'Hi!', timestamp: '2025-01-01T00:00:01Z' },
      ]);

      const result = await compressor.compressSession();
      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Summary of conversation');
      expect(result!.session_id).toBe('session-1');
      expect(result!.message_ids).toEqual([1, 2]);
    });

    it('should use specified threadId', async () => {
      mockMemory.getMessages.mockReturnValue([
        { id: 1, role: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
      ]);

      const result = await compressor.compressSession(undefined, 'thread-abc');
      expect(result).not.toBeNull();
      expect(result!.thread_id).toBe('thread-abc');
    });
  });

  describe('checkAndCompress', () => {
    it('should not compress if fewer than 50 messages', async () => {
      mockMemory.getMessages.mockReturnValue(
        Array.from({ length: 10 }, (_, i) => ({
          id: i, role: 'user', content: `msg ${i}`, timestamp: '2025-01-01'
        }))
      );

      const result = await compressor.checkAndCompress();
      expect(result).toBeNull();
    });

    it('should compress if more than 50 messages', async () => {
      mockMemory.getMessages.mockReturnValue(
        Array.from({ length: 60 }, (_, i) => ({
          id: i, role: 'user', content: `msg ${i}`, timestamp: '2025-01-01'
        }))
      );

      const result = await compressor.checkAndCompress();
      expect(result).not.toBeNull();
    });
  });

  describe('compressIfNeeded', () => {
    it('should return false if too few messages and not forced', async () => {
      mockMemory.getMessages.mockReturnValue(
        Array.from({ length: 5 }, (_, i) => ({
          id: i, role: 'user', content: `msg ${i}`, timestamp: '2025-01-01'
        }))
      );

      const result = await compressor.compressIfNeeded();
      expect(result).toBe(false);
    });

    it('should compress when forced even with few messages', async () => {
      mockMemory.getMessages.mockReturnValue([
        { id: 1, role: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
      ]);

      const result = await compressor.compressIfNeeded(true);
      expect(result).toBe(true);
    });

    it('should return false when no messages at all', async () => {
      mockMemory.getMessages.mockReturnValue([]);
      const result = await compressor.compressIfNeeded(true);
      expect(result).toBe(false);
    });
  });

  describe('getCompressedMemories', () => {
    it('should return empty array when no compressed memories', () => {
      mockMemory.db.all.mockReturnValue([]);
      const memories = compressor.getCompressedMemories();
      expect(memories).toEqual([]);
    });

    it('should return parsed compressed memories', () => {
      mockMemory.db.all.mockReturnValue([
        {
          id: 1,
          session_id: 'session-1',
          thread_id: 'thread-1',
          summary: 'Test summary',
          message_ids: '[1,2,3]',
          start_time: '2025-01-01T00:00:00Z',
          end_time: '2025-01-01T00:01:00Z',
          embedding: null,
          created_at: '2025-01-01',
        },
      ]);

      const memories = compressor.getCompressedMemories();
      expect(memories).toHaveLength(1);
      expect(memories[0].summary).toBe('Test summary');
      expect(memories[0].message_ids).toEqual([1, 2, 3]);
    });
  });

  describe('markMessagesAsCompressed', () => {
    it('should return 0 when no compressed memories', () => {
      mockMemory.db.all.mockReturnValue([]);
      const count = compressor.markMessagesAsCompressed();
      expect(count).toBe(0);
    });

    it('should mark messages when compressed memories exist', () => {
      mockMemory.db.all.mockReturnValue([
        {
          id: 1,
          session_id: 'session-1',
          thread_id: 'thread-1',
          summary: 'Test',
          message_ids: '[1,2,3]',
          start_time: '2025-01-01',
          end_time: '2025-01-01',
          embedding: null,
          created_at: '2025-01-01',
        },
      ]);

      const count = compressor.markMessagesAsCompressed();
      expect(count).toBe(3);
    });
  });
});
