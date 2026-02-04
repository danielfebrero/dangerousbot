import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileHandler, readFileDefinition } from '../../read-file.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

describe('read_file tool', () => {
  let ctx: ToolContext;
  let readFileMock: ReturnType<typeof vi.fn>;
  let readImageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readFileMock = vi.fn().mockReturnValue({ success: true, content: 'file content here' });
    readImageMock = vi.fn().mockReturnValue({ success: true, data: 'base64data', media_type: 'image/png' });

    ctx = createMockToolContext({
      executor: {
        ...createMockToolContext().executor,
        readFile: readFileMock,
        readImage: readImageMock,
      },
    });
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(readFileHandler.name).toBe('read_file');
    });

    it('should expose the definition', () => {
      expect(readFileHandler.definition).toBe(readFileDefinition);
    });

    it('should require the path property', () => {
      expect(readFileDefinition.input_schema.required).toContain('path');
    });
  });

  describe('text file reading', () => {
    it('should delegate to executor.readFile for a .ts file', async () => {
      const result = await readFileHandler.execute({ path: 'src/main.ts' }, ctx);

      expect(readFileMock).toHaveBeenCalledWith('src/main.ts', undefined, undefined);
      expect(result).toEqual({ success: true, content: 'file content here' });
    });

    it('should pass offset and limit to executor.readFile', async () => {
      const result = await readFileHandler.execute(
        { path: 'src/main.ts', offset: 10, limit: 50 },
        ctx,
      );

      expect(readFileMock).toHaveBeenCalledWith('src/main.ts', 10, 50);
      expect(result.success).toBe(true);
    });

    it('should handle a text file with no extension', async () => {
      await readFileHandler.execute({ path: 'Makefile' }, ctx);

      expect(readFileMock).toHaveBeenCalledWith('Makefile', undefined, undefined);
      expect(readImageMock).not.toHaveBeenCalled();
    });

    it('should propagate errors from executor.readFile', async () => {
      readFileMock.mockReturnValue({ success: false, error: 'File not found' });

      const result = await readFileHandler.execute({ path: 'missing.ts' }, ctx);

      expect(result).toEqual({ success: false, error: 'File not found' });
    });
  });

  describe('image file reading', () => {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

    imageExtensions.forEach((ext) => {
      it(`should detect ${ext} as an image extension`, async () => {
        await readFileHandler.execute({ path: `photo${ext}` }, ctx);

        expect(readImageMock).toHaveBeenCalledWith(`photo${ext}`);
        expect(readFileMock).not.toHaveBeenCalled();
      });
    });

    it('should detect uppercase image extensions', async () => {
      await readFileHandler.execute({ path: 'PHOTO.PNG' }, ctx);

      expect(readImageMock).toHaveBeenCalledWith('PHOTO.PNG');
      expect(readFileMock).not.toHaveBeenCalled();
    });

    it('should return structured image data on success', async () => {
      const result = await readFileHandler.execute({ path: 'diagram.png' }, ctx);

      expect(result).toEqual({
        success: true,
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'base64data',
        },
        message: 'Image lue: diagram.png',
      });
    });

    it('should return the raw result when readImage fails', async () => {
      readImageMock.mockReturnValue({ success: false, error: 'Cannot read image' });

      const result = await readFileHandler.execute({ path: 'broken.jpg' }, ctx);

      expect(result).toEqual({ success: false, error: 'Cannot read image' });
    });

    it('should return the raw result when readImage has no data', async () => {
      readImageMock.mockReturnValue({ success: true, data: null, media_type: 'image/png' });

      const result = await readFileHandler.execute({ path: 'empty.png' }, ctx);

      // Falls through because data is falsy
      expect(result).toEqual({ success: true, data: null, media_type: 'image/png' });
    });
  });
});
