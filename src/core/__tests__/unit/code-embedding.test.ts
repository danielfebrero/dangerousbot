import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config', () => ({
  APIS: { MISTRAL_API_KEY: 'test-key' },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { CodeEmbeddingService } from '../../code-embedding.js';

describe('CodeEmbeddingService', () => {
  let service: CodeEmbeddingService;

  beforeEach(() => {
    mockFetch.mockReset();
    service = new CodeEmbeddingService('test-api-key');
  });

  describe('embedCode', () => {
    it('should return vector and tokenCount from API response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          usage: { prompt_tokens: 10, total_tokens: 15 },
        }),
      });

      const result = await service.embedCode('const x = 1;');

      expect(result.vector).toEqual([0.1, 0.2, 0.3]);
      expect(result.tokenCount).toBe(15);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should prepend filename comment when filename is provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [0.4, 0.5, 0.6], index: 0 }],
          usage: { prompt_tokens: 12, total_tokens: 18 },
        }),
      });

      await service.embedCode('const x = 1;', 'test.ts');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.input).toContain('// File: test.ts');
    });

    it('should throw when API returns a non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(service.embedCode('const x = 1;')).rejects.toThrow(
        'Mistral embedding failed: 401 - Unauthorized'
      );
    });
  });

  describe('embedCodeBatch', () => {
    it('should return embeddings sorted by index', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { embedding: [0.7, 0.8, 0.9], index: 1 },
            { embedding: [0.1, 0.2, 0.3], index: 0 },
          ],
          usage: { prompt_tokens: 20, total_tokens: 30 },
        }),
      });

      const result = await service.embedCodeBatch([
        { code: 'const a = 1;', filename: 'a.ts' },
        { code: 'const b = 2;', filename: 'b.ts' },
      ]);

      expect(result).toHaveLength(2);
      // Index 0 should come first after sorting
      expect(result[0].vector).toEqual([0.1, 0.2, 0.3]);
      expect(result[1].vector).toEqual([0.7, 0.8, 0.9]);
      // Token count is total_tokens / items.length = 30 / 2 = 15
      expect(result[0].tokenCount).toBe(15);
      expect(result[1].tokenCount).toBe(15);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const v = [1, 2, 3];
      expect(CodeEmbeddingService.cosineSimilarity(v, v)).toBeCloseTo(1);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(CodeEmbeddingService.cosineSimilarity(a, b)).toBeCloseTo(0);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(CodeEmbeddingService.cosineSimilarity(a, b)).toBeCloseTo(-1);
    });

    it('should throw if vectors have different lengths', () => {
      expect(() =>
        CodeEmbeddingService.cosineSimilarity([1, 2], [1, 2, 3])
      ).toThrow('Vectors must have same length');
    });
  });

  describe('findTopK', () => {
    it('should return top K most similar candidates sorted by similarity', () => {
      const query = [1, 0, 0];
      const candidates = [
        { id: 1, vector: [1, 0, 0] },   // similarity = 1
        { id: 2, vector: [0, 1, 0] },   // similarity = 0
        { id: 3, vector: [0.9, 0.1, 0] }, // high similarity
        { id: 4, vector: [-1, 0, 0] },  // similarity = -1
      ];

      const topK = CodeEmbeddingService.findTopK(query, candidates, 2);

      expect(topK).toHaveLength(2);
      expect(topK[0].id).toBe(1);
      expect(topK[0].similarity).toBeCloseTo(1);
      expect(topK[1].id).toBe(3);
      expect(topK[1].similarity).toBeGreaterThan(0);
    });
  });
});
