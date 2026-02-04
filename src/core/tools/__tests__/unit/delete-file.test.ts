import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteFileHandler, deleteFileDefinition } from '../../delete-file.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

describe('delete_file tool', () => {
  let ctx: ToolContext;
  let deleteFileMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deleteFileMock = vi.fn().mockReturnValue({ success: true, message: 'File deleted successfully' });

    ctx = createMockToolContext({
      executor: {
        ...createMockToolContext().executor,
        deleteFile: deleteFileMock,
      },
    });
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(deleteFileHandler.name).toBe('delete_file');
    });

    it('should expose the definition', () => {
      expect(deleteFileHandler.definition).toBe(deleteFileDefinition);
    });

    it('should require the path property', () => {
      expect(deleteFileDefinition.input_schema.required).toContain('path');
    });
  });

  describe('execute', () => {
    it('should delegate to executor.deleteFile with correct arguments', async () => {
      const result = await deleteFileHandler.execute({ path: 'tmp/old-file.txt' }, ctx);

      expect(deleteFileMock).toHaveBeenCalledWith('tmp/old-file.txt');
      expect(result).toEqual({ success: true, message: 'File deleted successfully' });
    });

    it('should handle absolute paths', async () => {
      await deleteFileHandler.execute({ path: '/home/user/file.log' }, ctx);

      expect(deleteFileMock).toHaveBeenCalledWith('/home/user/file.log');
    });

    it('should propagate errors from executor.deleteFile', async () => {
      deleteFileMock.mockReturnValue({ success: false, error: 'File not found' });

      const result = await deleteFileHandler.execute({ path: 'nonexistent.txt' }, ctx);

      expect(result).toEqual({ success: false, error: 'File not found' });
    });

    it('should propagate permission errors', async () => {
      deleteFileMock.mockReturnValue({ success: false, error: 'Permission denied' });

      const result = await deleteFileHandler.execute({ path: '/etc/protected' }, ctx);

      expect(result).toEqual({ success: false, error: 'Permission denied' });
    });
  });
});
