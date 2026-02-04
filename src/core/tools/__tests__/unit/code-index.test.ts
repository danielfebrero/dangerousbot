/**
 * Unit tests for code_index tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const { mockMemory } = vi.hoisted(() => ({
  mockMemory: {
    listIndexedProjects: vi.fn().mockReturnValue([]),
    deleteProjectEmbeddings: vi.fn(),
    getCodeEmbeddingStats: vi.fn().mockReturnValue({
      total_files: 5,
      total_tokens: 1000,
      last_indexed: '2024-01-01',
    }),
  },
}));

const { mockIndexAll } = vi.hoisted(() => ({
  mockIndexAll: vi.fn().mockResolvedValue({ indexed: 5, updated: 0, deleted: 0 }),
}));

const { mockIndexerRegistry } = vi.hoisted(() => ({
  mockIndexerRegistry: new Map(),
}));

vi.mock('../../../memory.js', () => ({
  getMemory: vi.fn(() => mockMemory),
}));

vi.mock('../../../code-embedding.js', () => ({
  getCodeEmbeddingService: vi.fn(() => ({})),
}));

vi.mock('../../../code-indexer.js', () => ({
  initCodeIndexer: vi.fn(() => ({ indexAll: mockIndexAll })),
  getCodeIndexer: vi.fn(),
  indexerRegistry: mockIndexerRegistry,
  removeCodeIndexer: vi.fn(),
}));

const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
}));

import { codeIndexHandler, codeIndexDefinition } from '../../code-index.js';

describe('code_index tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMemory.listIndexedProjects.mockReturnValue([]);
    mockMemory.getCodeEmbeddingStats.mockReturnValue({
      total_files: 5,
      total_tokens: 1000,
      last_indexed: '2024-01-01',
    });
    mockIndexAll.mockResolvedValue({ indexed: 5, updated: 0, deleted: 0 });
    mockExistsSync.mockReturnValue(true);
    mockIndexerRegistry.clear();
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(codeIndexHandler.name).toBe('code_index');
    });

    it('should expose the definition', () => {
      expect(codeIndexHandler.definition).toBe(codeIndexDefinition);
    });

    it('should require the action property', () => {
      expect(codeIndexDefinition.input_schema.required).toContain('action');
    });
  });

  describe('add action', () => {
    it('should return error when project_name is missing', async () => {
      const result = await codeIndexHandler.execute(
        { action: 'add', project_path: '/some/path' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('project_name');
      expect(result.error).toContain('project_path');
    });

    it('should return error when project_path is missing', async () => {
      const result = await codeIndexHandler.execute(
        { action: 'add', project_name: 'my_project' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('project_name');
      expect(result.error).toContain('project_path');
    });

    it('should return error when project_path does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await codeIndexHandler.execute(
        { action: 'add', project_name: 'my_project', project_path: '/nonexistent' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("/nonexistent");
    });

    it('should successfully index a new project', async () => {
      const result = await codeIndexHandler.execute(
        { action: 'add', project_name: 'my_project', project_path: '/home/user/project' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.results).toEqual({ indexed: 5, updated: 0, deleted: 0 });
      expect(result.message).toContain('my_project');
      expect(result.message).toContain('5 fichiers nouveaux');
    });

    it('should replace existing project when re-adding', async () => {
      mockMemory.listIndexedProjects.mockReturnValue(['my_project']);

      const result = await codeIndexHandler.execute(
        { action: 'add', project_name: 'my_project', project_path: '/home/user/project' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(mockMemory.deleteProjectEmbeddings).toHaveBeenCalledWith('my_project');
    });
  });

  describe('refresh action', () => {
    it('should return error when project_name is missing', async () => {
      const result = await codeIndexHandler.execute(
        { action: 'refresh' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('project_name');
    });

    it('should refresh with a new project_path', async () => {
      mockIndexAll.mockResolvedValue({ indexed: 2, updated: 3, deleted: 1 });

      const result = await codeIndexHandler.execute(
        { action: 'refresh', project_name: 'my_project', project_path: '/home/user/project' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.results).toEqual({ indexed: 2, updated: 3, deleted: 1 });
      expect(result.message).toContain('rafraîchi');
    });

    it('should return error when no project_path and no existing indexer', async () => {
      const result = await codeIndexHandler.execute(
        { action: 'refresh', project_name: 'unknown_project' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('unknown_project');
    });
  });

  describe('list action', () => {
    it('should return empty list when no projects indexed', async () => {
      mockMemory.listIndexedProjects.mockReturnValue([]);

      const result = await codeIndexHandler.execute({ action: 'list' }, ctx);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
      expect(result.message).toContain('Aucun projet');
    });

    it('should list indexed projects with stats', async () => {
      mockMemory.listIndexedProjects.mockReturnValue(['project_a', 'project_b']);
      mockMemory.getCodeEmbeddingStats
        .mockReturnValueOnce({ total_files: 10, total_tokens: 5000, last_indexed: '2024-06-01' })
        .mockReturnValueOnce({ total_files: 3, total_tokens: 800, last_indexed: '2024-05-15' });

      const result = await codeIndexHandler.execute({ action: 'list' }, ctx);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].name).toBe('project_a');
      expect(result.results[0].files).toBe(10);
      expect(result.results[1].name).toBe('project_b');
      expect(result.results[1].files).toBe(3);
      expect(result.message).toContain('project_a');
      expect(result.message).toContain('project_b');
    });
  });

  describe('remove action', () => {
    it('should return error when project_name is missing', async () => {
      const result = await codeIndexHandler.execute({ action: 'remove' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('project_name');
    });

    it('should return error when project is not found', async () => {
      mockMemory.listIndexedProjects.mockReturnValue([]);

      const result = await codeIndexHandler.execute(
        { action: 'remove', project_name: 'nonexistent' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
    });

    it('should successfully remove a project', async () => {
      mockMemory.listIndexedProjects.mockReturnValue(['my_project']);

      const result = await codeIndexHandler.execute(
        { action: 'remove', project_name: 'my_project' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(mockMemory.deleteProjectEmbeddings).toHaveBeenCalledWith('my_project');
      expect(result.message).toContain('supprimé');
    });
  });

  describe('unknown action', () => {
    it('should return error for unknown action', async () => {
      const result = await codeIndexHandler.execute({ action: 'purge' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('purge');
    });
  });

  describe('error handling', () => {
    it('should catch and return errors', async () => {
      mockIndexAll.mockRejectedValue(new Error('Embedding API down'));

      const result = await codeIndexHandler.execute(
        { action: 'add', project_name: 'broken', project_path: '/tmp/broken' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Embedding API down');
    });
  });
});
