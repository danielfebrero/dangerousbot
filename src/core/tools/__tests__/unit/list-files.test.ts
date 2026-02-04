import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listFilesHandler, listFilesDefinition } from '../../list-files.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

describe('list_files tool', () => {
  let ctx: ToolContext;
  let listFilesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listFilesMock = vi.fn().mockReturnValue({
      success: true,
      files: ['index.ts', 'config.ts', 'utils/'],
    });

    ctx = createMockToolContext({
      executor: {
        ...createMockToolContext().executor,
        listFiles: listFilesMock,
      },
    });
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(listFilesHandler.name).toBe('list_files');
    });

    it('should expose the definition', () => {
      expect(listFilesHandler.definition).toBe(listFilesDefinition);
    });

    it('should require the path property', () => {
      expect(listFilesDefinition.input_schema.required).toContain('path');
    });
  });

  describe('execute', () => {
    it('should delegate to executor.listFiles with correct arguments', async () => {
      const result = await listFilesHandler.execute({ path: 'src/' }, ctx);

      expect(listFilesMock).toHaveBeenCalledWith('src/');
      expect(result).toEqual({
        success: true,
        files: ['index.ts', 'config.ts', 'utils/'],
      });
    });

    it('should handle the project root path', async () => {
      await listFilesHandler.execute({ path: '.' }, ctx);

      expect(listFilesMock).toHaveBeenCalledWith('.');
    });

    it('should handle absolute paths', async () => {
      await listFilesHandler.execute({ path: '/home/user/projects' }, ctx);

      expect(listFilesMock).toHaveBeenCalledWith('/home/user/projects');
    });

    it('should return an empty file list when directory is empty', async () => {
      listFilesMock.mockReturnValue({ success: true, files: [] });

      const result = await listFilesHandler.execute({ path: 'empty-dir/' }, ctx);

      expect(result).toEqual({ success: true, files: [] });
    });

    it('should propagate errors from executor.listFiles', async () => {
      listFilesMock.mockReturnValue({ success: false, error: 'Directory not found' });

      const result = await listFilesHandler.execute({ path: 'nonexistent/' }, ctx);

      expect(result).toEqual({ success: false, error: 'Directory not found' });
    });
  });
});
