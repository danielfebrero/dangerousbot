import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileHandler, writeFileDefinition } from '../../write-file.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

describe('write_file tool', () => {
  let ctx: ToolContext;
  let writeFileMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeFileMock = vi.fn().mockReturnValue({ success: true, message: 'File written successfully' });

    ctx = createMockToolContext({
      executor: {
        ...createMockToolContext().executor,
        writeFile: writeFileMock,
      },
    });
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(writeFileHandler.name).toBe('write_file');
    });

    it('should expose the definition', () => {
      expect(writeFileHandler.definition).toBe(writeFileDefinition);
    });

    it('should require path and content properties', () => {
      expect(writeFileDefinition.input_schema.required).toContain('path');
      expect(writeFileDefinition.input_schema.required).toContain('content');
    });
  });

  describe('execute', () => {
    it('should delegate to executor.writeFile with correct arguments', async () => {
      const result = await writeFileHandler.execute(
        { path: 'output.txt', content: 'Hello, world!' },
        ctx,
      );

      expect(writeFileMock).toHaveBeenCalledWith('output.txt', 'Hello, world!');
      expect(result).toEqual({ success: true, message: 'File written successfully' });
    });

    it('should handle empty content', async () => {
      await writeFileHandler.execute({ path: 'empty.txt', content: '' }, ctx);

      expect(writeFileMock).toHaveBeenCalledWith('empty.txt', '');
    });

    it('should handle multiline content', async () => {
      const multiline = 'line1\nline2\nline3';
      await writeFileHandler.execute({ path: 'multi.txt', content: multiline }, ctx);

      expect(writeFileMock).toHaveBeenCalledWith('multi.txt', multiline);
    });

    it('should propagate errors from executor.writeFile', async () => {
      writeFileMock.mockReturnValue({ success: false, error: 'Permission denied' });

      const result = await writeFileHandler.execute(
        { path: '/root/secret.txt', content: 'data' },
        ctx,
      );

      expect(result).toEqual({ success: false, error: 'Permission denied' });
    });
  });
});
