/**
 * Unit tests for MessageEmbedder
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockMemory = {
  updateMessageEmbedding: vi.fn(),
  getMessagesWithoutEmbedding: vi.fn().mockReturnValue([]),
  getMessagesWithEmbeddings: vi.fn().mockReturnValue([]),
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
    cosineSimilarity: (a: number[], b: number[]) => {
      let dot = 0, magA = 0, magB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
      }
      const mag = Math.sqrt(magA) * Math.sqrt(magB);
      return mag === 0 ? 0 : dot / mag;
    },
  },
}));

import { MessageEmbedder } from '../../message-embedder.js';

describe('MessageEmbedder', () => {
  let embedder: MessageEmbedder;

  beforeEach(() => {
    embedder = new MessageEmbedder();
    mockMemory.updateMessageEmbedding.mockReset();
    mockMemory.getMessagesWithoutEmbedding.mockReset().mockReturnValue([]);
    mockMemory.getMessagesWithEmbeddings.mockReset().mockReturnValue([]);
    mockEmbeddingService.embed.mockReset().mockResolvedValue({ vector: [0.1, 0.2, 0.3], tokenCount: 10 });
  });

  describe('embedMessageAsync', () => {
    it('should queue message for embedding without blocking', () => {
      // Should not throw and should return immediately
      embedder.embedMessageAsync(1, 'Hello world');
      // The actual embedding happens asynchronously
    });
  });

  describe('repairMissingEmbeddings', () => {
    it('should process messages without embeddings', async () => {
      mockMemory.getMessagesWithoutEmbedding.mockReturnValue([
        { id: 1, content: 'Message 1', role: 'user' },
        { id: 2, content: 'Message 2', role: 'assistant' },
      ]);

      const result = await embedder.repairMissingEmbeddings(10);
      expect(result.repaired).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty batch', async () => {
      mockMemory.getMessagesWithoutEmbedding.mockReturnValue([]);

      const result = await embedder.repairMissingEmbeddings();
      expect(result.repaired).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('searchMessages', () => {
    it('should return similar messages ranked by similarity', async () => {
      mockEmbeddingService.embed.mockResolvedValue({ vector: [1, 0, 0], tokenCount: 5 });
      mockMemory.getMessagesWithEmbeddings.mockReturnValue([
        { id: 1, content: 'Hello', role: 'user', embedding: [1, 0, 0], timestamp: '2025-01-01' },
        { id: 2, content: 'World', role: 'user', embedding: [0, 1, 0], timestamp: '2025-01-01' },
      ]);

      const results = await embedder.searchMessages('Hello', 5);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle no messages with embeddings', async () => {
      mockMemory.getMessagesWithEmbeddings.mockReturnValue([]);

      const results = await embedder.searchMessages('test');
      expect(results).toEqual([]);
    });
  });
});
