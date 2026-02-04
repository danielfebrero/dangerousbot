/**
 * Unit tests for download_file tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const { mockDownloadFile } = vi.hoisted(() => ({
  mockDownloadFile: vi.fn(),
}));

const { mockCheckCancellation } = vi.hoisted(() => ({
  mockCheckCancellation: vi.fn(),
}));

vi.mock('../../../services/download.js', () => ({
  downloadService: { downloadFile: mockDownloadFile },
}));

vi.mock('../../../tool-cancellation.js', () => ({
  checkCancellation: mockCheckCancellation,
}));

import { downloadFileHandler, downloadFileDefinition } from '../../download-file.js';

describe('download_file tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(downloadFileHandler.name).toBe('download_file');
    });

    it('should expose the definition', () => {
      expect(downloadFileHandler.definition).toBe(downloadFileDefinition);
    });

    it('should require the url property', () => {
      expect(downloadFileDefinition.input_schema.required).toContain('url');
    });
  });

  describe('execute', () => {
    it('should return error when url is missing', async () => {
      const result = await downloadFileHandler.execute({}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('URL requise');
    });

    it('should download file successfully', async () => {
      mockDownloadFile.mockResolvedValue({
        success: true,
        fileId: 42,
        filename: 'document.pdf',
        size: 1048576,
        mimeType: 'application/pdf',
        path: '/tmp/downloads/document.pdf',
      });

      const result = await downloadFileHandler.execute(
        { url: 'https://example.com/document.pdf' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.data.fileId).toBe(42);
      expect(result.data.filename).toBe('document.pdf');
      expect(result.data.size).toBe(1048576);
      expect(result.data.sizeFormatted).toBe('1 MB');
      expect(result.data.mimeType).toBe('application/pdf');
      expect(mockDownloadFile).toHaveBeenCalledWith('https://example.com/document.pdf', {
        filename: undefined,
        source: 'webapp',
        abortSignal: undefined,
      });
    });

    it('should pass custom filename to download service', async () => {
      mockDownloadFile.mockResolvedValue({
        success: true,
        fileId: 1,
        filename: 'custom.pdf',
        size: 500,
        mimeType: 'application/pdf',
        path: '/tmp/downloads/custom.pdf',
      });

      const result = await downloadFileHandler.execute(
        { url: 'https://example.com/file', filename: 'custom.pdf' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.data.originalName).toBe('custom.pdf');
      expect(mockDownloadFile).toHaveBeenCalledWith('https://example.com/file', {
        filename: 'custom.pdf',
        source: 'webapp',
        abortSignal: undefined,
      });
    });

    it('should return error when download fails', async () => {
      mockDownloadFile.mockResolvedValue({
        success: false,
        error: 'Network error',
      });

      const result = await downloadFileHandler.execute(
        { url: 'https://example.com/bad' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should detect cancellation from abort error', async () => {
      mockDownloadFile.mockRejectedValue(new Error('Request was aborted'));

      const result = await downloadFileHandler.execute(
        { url: 'https://example.com/large' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(result.error).toContain('annulé');
    });

    it('should detect cancellation from cancelled error', async () => {
      mockDownloadFile.mockRejectedValue(new Error('Download cancelled'));

      const result = await downloadFileHandler.execute(
        { url: 'https://example.com/large' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
    });

    it('should return generic error for non-cancel failures', async () => {
      mockDownloadFile.mockRejectedValue(new Error('Timeout'));

      const result = await downloadFileHandler.execute(
        { url: 'https://example.com/slow' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.cancelled).toBeUndefined();
      expect(result.error).toContain('Timeout');
    });

    it('should call checkCancellation with the abort signal', async () => {
      const controller = new AbortController();
      ctx.abortSignal = controller.signal;

      mockDownloadFile.mockResolvedValue({
        success: true,
        fileId: 1,
        filename: 'f.txt',
        size: 10,
        mimeType: 'text/plain',
        path: '/tmp/f.txt',
      });

      await downloadFileHandler.execute({ url: 'https://example.com/f.txt' }, ctx);

      expect(mockCheckCancellation).toHaveBeenCalledWith(controller.signal);
    });
  });
});
