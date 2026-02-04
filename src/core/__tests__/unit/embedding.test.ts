/**
 * Unit tests for EmbeddingService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock config
vi.mock('../../../config', () => ({
  MODELS: { EMBEDDING: 'test-embedding-model' },
  APIS: {
    OPENROUTER_EMBEDDINGS: 'https://test.api/v1/embeddings',
    OPENROUTER_REFERER: 'https://test.local',
    OPENROUTER_TITLE: 'TestBot',
    OPENROUTER_API_KEY: 'test-key',
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { EmbeddingService } from '../../embedding.js';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    service = new EmbeddingService('test-api-key');
    mockFetch.mockReset();
  });

  describe('embed', () => {
    it('should return vector and token count', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 10 },
        }),
      });

      const result = await service.embed('Hello world');
      expect(result.vector).toEqual([0.1, 0.2, 0.3]);
      expect(result.tokenCount).toBe(10);
    });

    it('should call fetch with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [0.1] }],
          usage: { total_tokens: 5 },
        }),
      });

      await service.embed('test text');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });

      await expect(service.embed('test')).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(service.embed('test')).rejects.toThrow('Network error');
    });
  });

  describe('embedBatch', () => {
    it('should embed multiple texts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { embedding: [0.1, 0.2] },
            { embedding: [0.3, 0.4] },
          ],
          usage: { total_tokens: 20 },
        }),
      });

      const results = await service.embedBatch(['text1', 'text2']);
      expect(results).toHaveLength(2);
      expect(results[0].vector).toEqual([0.1, 0.2]);
      expect(results[1].vector).toEqual([0.3, 0.4]);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const v = [1, 0, 0];
      expect(EmbeddingService.cosineSimilarity(v, v)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(EmbeddingService.cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(EmbeddingService.cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('should handle zero vectors', () => {
      const a = [0, 0];
      const b = [1, 0];
      const result = EmbeddingService.cosineSimilarity(a, b);
      expect(isNaN(result) || result === 0).toBe(true);
    });
  });

  describe('findTopK', () => {
    it('should return top K most similar candidates', () => {
      const query = [1, 0, 0];
      const candidates = [
        { id: 1, vector: [1, 0, 0] },       // exact match
        { id: 2, vector: [0, 1, 0] },       // orthogonal
        { id: 3, vector: [0.9, 0.1, 0] },   // close match
      ];

      const results = EmbeddingService.findTopK(
        query,
        candidates.map(c => ({ id: c.id, vector: c.vector })),
        2
      );

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(1); // Most similar first
    });
  });
});
