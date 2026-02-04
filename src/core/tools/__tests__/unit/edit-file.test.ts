import { describe, it, expect, vi, beforeEach } from 'vitest';
import { editFileHandler, editFileDefinition } from '../../edit-file.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

describe('edit_file tool', () => {
  let ctx: ToolContext;
  let editFileMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    editFileMock = vi.fn().mockReturnValue({ success: true, message: 'File edited successfully' });

    ctx = createMockToolContext({
      executor: {
        ...createMockToolContext().executor,
        editFile: editFileMock,
      },
    });
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(editFileHandler.name).toBe('edit_file');
    });

    it('should expose the definition', () => {
      expect(editFileHandler.definition).toBe(editFileDefinition);
    });

    it('should require path, old_string, and new_string properties', () => {
      expect(editFileDefinition.input_schema.required).toContain('path');
      expect(editFileDefinition.input_schema.required).toContain('old_string');
      expect(editFileDefinition.input_schema.required).toContain('new_string');
    });

    it('should not require replace_all', () => {
      expect(editFileDefinition.input_schema.required).not.toContain('replace_all');
    });
  });

  describe('execute', () => {
    it('should delegate to executor.editFile with correct arguments', async () => {
      const result = await editFileHandler.execute(
        { path: 'src/app.ts', old_string: 'foo', new_string: 'bar' },
        ctx,
      );

      expect(editFileMock).toHaveBeenCalledWith('src/app.ts', 'foo', 'bar', false);
      expect(result).toEqual({ success: true, message: 'File edited successfully' });
    });

    it('should default replace_all to false when not provided', async () => {
      await editFileHandler.execute(
        { path: 'file.ts', old_string: 'a', new_string: 'b' },
        ctx,
      );

      expect(editFileMock).toHaveBeenCalledWith('file.ts', 'a', 'b', false);
    });

    it('should pass replace_all as true when specified', async () => {
      await editFileHandler.execute(
        { path: 'file.ts', old_string: 'old', new_string: 'new', replace_all: true },
        ctx,
      );

      expect(editFileMock).toHaveBeenCalledWith('file.ts', 'old', 'new', true);
    });

    it('should handle multiline strings', async () => {
      const oldStr = 'function hello() {\n  return "hi";\n}';
      const newStr = 'function hello() {\n  return "hello world";\n}';

      await editFileHandler.execute(
        { path: 'src/greet.ts', old_string: oldStr, new_string: newStr },
        ctx,
      );

      expect(editFileMock).toHaveBeenCalledWith('src/greet.ts', oldStr, newStr, false);
    });

    it('should propagate errors from executor.editFile', async () => {
      editFileMock.mockReturnValue({ success: false, error: 'String not found in file' });

      const result = await editFileHandler.execute(
        { path: 'file.ts', old_string: 'nonexistent', new_string: 'replacement' },
        ctx,
      );

      expect(result).toEqual({ success: false, error: 'String not found in file' });
    });
  });
});
