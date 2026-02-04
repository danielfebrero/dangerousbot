/**
 * Unit tests for retrieve_code tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const { mockEmbedCode, mockCosineSimilarity } = vi.hoisted(() => ({
  mockEmbedCode: vi.fn().mockResolvedValue({ vector: [0.1, 0.2, 0.3] }),
  mockCosineSimilarity: vi.fn().mockReturnValue(0.95),
}));

vi.mock('../../../memory.js', () => ({
  getMemory: vi.fn(),
}));

vi.mock('../../../code-embedding.js', () => ({
  getCodeEmbeddingService: vi.fn(() => ({
    embedCode: mockEmbedCode,
  })),
  CodeEmbeddingService: {
    cosineSimilarity: mockCosineSimilarity,
  },
}));

vi.mock('../../../../config.js', () => ({
  APIS: { MISTRAL_API_KEY: 'test-mistral-key' },
  PATHS: { MISTRAL_KEY_FILE: '/tmp/mistral_key' },
}));

import { retrieveCodeHandler, retrieveCodeDefinition } from '../../retrieve-code.js';

describe('retrieve_code tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedCode.mockResolvedValue({ vector: [0.1, 0.2, 0.3] });
    mockCosineSimilarity.mockReturnValue(0.95);
    ctx = createMockToolContext();
    ctx.memory.getAllCodeEmbeddings = vi.fn().mockReturnValue([]);
    ctx.memory.listIndexedProjects = vi.fn().mockReturnValue([]);
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(retrieveCodeHandler.name).toBe('retrieve_code');
    });

    it('should expose the definition', () => {
      expect(retrieveCodeHandler.definition).toBe(retrieveCodeDefinition);
    });

    it('should require the query property', () => {
      expect(retrieveCodeDefinition.input_schema.required).toContain('query');
    });
  });

  describe('execute', () => {
    it('should return empty results when no embeddings found and project does not exist', async () => {
      ctx.memory.getAllCodeEmbeddings = vi.fn().mockReturnValue([]);
      ctx.memory.listIndexedProjects = vi.fn().mockReturnValue([]);

      const result = await retrieveCodeHandler.execute(
        { query: 'some function' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('dangerousbot');
      expect(result.error).toContain('non trouvé');
    });

    it('should return empty results message when project exists but has no files', async () => {
      ctx.memory.getAllCodeEmbeddings = vi.fn().mockReturnValue([]);
      ctx.memory.listIndexedProjects = vi.fn().mockReturnValue(['dangerousbot']);

      const result = await retrieveCodeHandler.execute(
        { query: 'some function' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
      expect(result.message).toContain('aucun fichier indexé');
    });

    it('should return ranked results when embeddings are found', async () => {
      ctx.memory.getAllCodeEmbeddings = vi.fn().mockReturnValue([
        {
          file_path: 'src/core/memory.ts',
          content: 'export class Memory { /* ... */ }',
          embedding: [0.1, 0.2, 0.3],
        },
        {
          file_path: 'src/core/tools/recall.ts',
          content: 'export const recallHandler = { /* ... */ }',
          embedding: [0.4, 0.5, 0.6],
        },
      ]);

      // First call returns higher similarity, second returns lower
      mockCosineSimilarity
        .mockReturnValueOnce(0.92)
        .mockReturnValueOnce(0.78);

      const result = await retrieveCodeHandler.execute(
        { query: 'memory management', top_k: 2 },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      // Results should be sorted by similarity (descending)
      expect(result.results[0].similarity).toBeGreaterThanOrEqual(result.results[1].similarity);
      expect(mockEmbedCode).toHaveBeenCalledWith('memory management');
      expect(ctx.memory.getAllCodeEmbeddings).toHaveBeenCalledWith('dangerousbot');
    });

    it('should use custom project_name', async () => {
      ctx.memory.getAllCodeEmbeddings = vi.fn().mockReturnValue([]);
      ctx.memory.listIndexedProjects = vi.fn().mockReturnValue(['my_project']);

      const result = await retrieveCodeHandler.execute(
        { query: 'test', project_name: 'my_project' },
        ctx,
      );

      expect(ctx.memory.getAllCodeEmbeddings).toHaveBeenCalledWith('my_project');
      expect(result.success).toBe(true);
    });

    it('should default top_k to 5', async () => {
      const embeddings = Array.from({ length: 10 }, (_, i) => ({
        file_path: `src/file${i}.ts`,
        content: `content ${i}`,
        embedding: [0.1 * i],
      }));
      ctx.memory.getAllCodeEmbeddings = vi.fn().mockReturnValue(embeddings);
      mockCosineSimilarity.mockReturnValue(0.5);

      const result = await retrieveCodeHandler.execute(
        { query: 'something' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(5);
    });

    it('should handle errors gracefully', async () => {
      mockEmbedCode.mockRejectedValue(new Error('Embedding service unavailable'));

      const result = await retrieveCodeHandler.execute(
        { query: 'test query' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Embedding service unavailable');
    });

    it('should resolve relative file paths against projectRoot', async () => {
      ctx.memory.getAllCodeEmbeddings = vi.fn().mockReturnValue([
        {
          file_path: 'src/main.ts',
          content: 'const x = 1;',
          embedding: [0.1],
        },
      ]);
      mockCosineSimilarity.mockReturnValue(0.9);

      const result = await retrieveCodeHandler.execute(
        { query: 'main entry' },
        ctx,
      );

      expect(result.success).toBe(true);
      // The file path should be joined with projectRoot
      expect(result.results[0].file_path).toContain('src/main.ts');
    });

    it('should keep absolute file paths as-is', async () => {
      ctx.memory.getAllCodeEmbeddings = vi.fn().mockReturnValue([
        {
          file_path: '/absolute/path/file.ts',
          content: 'const y = 2;',
          embedding: [0.2],
        },
      ]);
      mockCosineSimilarity.mockReturnValue(0.85);

      const result = await retrieveCodeHandler.execute(
        { query: 'absolute path file' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.results[0].file_path).toBe('/absolute/path/file.ts');
    });
  });
});
