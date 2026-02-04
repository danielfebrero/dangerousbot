/**
 * Unit tests for send_file tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const { mockDownloadFile, mockGetFile, mockGetFilePath, mockDeleteFile } = vi.hoisted(() => ({
  mockDownloadFile: vi.fn(),
  mockGetFile: vi.fn(),
  mockGetFilePath: vi.fn(),
  mockDeleteFile: vi.fn(),
}));

const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../services/download.js', () => ({
  downloadService: {
    downloadFile: mockDownloadFile,
    getFile: mockGetFile,
    getFilePath: mockGetFilePath,
    deleteFile: mockDeleteFile,
  },
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
}));

import { sendFileHandler, sendFileDefinition } from '../../send-file.js';

describe('send_file tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    ctx = createMockToolContext({ source: 'webapp' });
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(sendFileHandler.name).toBe('send_file');
    });

    it('should expose the definition', () => {
      expect(sendFileHandler.definition).toBe(sendFileDefinition);
    });
  });

  describe('execute', () => {
    it('should return error when neither file_id nor url is provided', async () => {
      const result = await sendFileHandler.execute({}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('file_id');
      expect(result.error).toContain('url');
    });

    it('should send file by id for webapp', async () => {
      const fileRecord = {
        id: 10,
        filename: 'stored_abc123.pdf',
        original_name: 'report.pdf',
        size_bytes: 2048,
        mime_type: 'application/pdf',
      };

      mockGetFile.mockResolvedValue(fileRecord);
      mockGetFilePath.mockReturnValue('/tmp/downloads/stored_abc123.pdf');

      const result = await sendFileHandler.execute({ file_id: 10 }, ctx);

      expect(result.success).toBe(true);
      expect(result.data.fileId).toBe(10);
      expect(result.data.platform).toBe('webapp');
      expect(result.data.url).toBe('/api/files/10');
      expect(result.data.filename).toBe('report.pdf');
    });

    it('should return error when file not found by id', async () => {
      mockGetFile.mockResolvedValue(null);

      const result = await sendFileHandler.execute({ file_id: 999 }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('999');
      expect(result.error).toContain('introuvable');
    });

    it('should return error when file no longer exists on disk', async () => {
      mockGetFile.mockResolvedValue({
        id: 5,
        filename: 'gone.txt',
        original_name: 'gone.txt',
        size_bytes: 100,
        mime_type: 'text/plain',
      });
      mockGetFilePath.mockReturnValue('/tmp/downloads/gone.txt');
      mockExistsSync.mockReturnValue(false);

      const result = await sendFileHandler.execute({ file_id: 5 }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain("n'existe plus");
    });

    it('should download from url then send when only url is provided', async () => {
      mockDownloadFile.mockResolvedValue({
        success: true,
        fileId: 20,
        filename: 'downloaded.zip',
        size: 4096,
        mimeType: 'application/zip',
        path: '/tmp/downloads/downloaded.zip',
      });

      const fileRecord = {
        id: 20,
        filename: 'downloaded.zip',
        original_name: 'downloaded.zip',
        size_bytes: 4096,
        mime_type: 'application/zip',
      };
      mockGetFile.mockResolvedValue(fileRecord);
      mockGetFilePath.mockReturnValue('/tmp/downloads/downloaded.zip');

      const result = await sendFileHandler.execute(
        { url: 'https://example.com/file.zip' },
        ctx,
      );

      expect(mockDownloadFile).toHaveBeenCalledWith('https://example.com/file.zip', {
        source: 'webapp',
        telegramChatId: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.data.fileId).toBe(20);
    });

    it('should return error when url download fails', async () => {
      mockDownloadFile.mockResolvedValue({
        success: false,
        error: 'Download failed',
      });

      const result = await sendFileHandler.execute(
        { url: 'https://example.com/broken' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download failed');
    });

    it('should prefer file_id over url when both are provided', async () => {
      const fileRecord = {
        id: 7,
        filename: 'existing.txt',
        original_name: 'existing.txt',
        size_bytes: 512,
        mime_type: 'text/plain',
      };
      mockGetFile.mockResolvedValue(fileRecord);
      mockGetFilePath.mockReturnValue('/tmp/downloads/existing.txt');

      const result = await sendFileHandler.execute(
        { file_id: 7, url: 'https://example.com/other' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.data.fileId).toBe(7);
      expect(mockDownloadFile).not.toHaveBeenCalled();
    });

    it('should detect telegram platform from context', async () => {
      ctx = createMockToolContext({
        source: 'telegram',
        telegramChatId: '12345',
        bot: {
          sendDocument: vi.fn().mockResolvedValue({}),
        },
      });

      const fileRecord = {
        id: 3,
        filename: 'doc.pdf',
        original_name: 'doc.pdf',
        size_bytes: 1024,
        mime_type: 'application/pdf',
      };
      mockGetFile.mockResolvedValue(fileRecord);
      mockGetFilePath.mockReturnValue('/tmp/downloads/doc.pdf');

      const result = await sendFileHandler.execute({ file_id: 3 }, ctx);

      expect(result.success).toBe(true);
      expect(result.data.platform).toBe('telegram');
      expect(result.data.deleted).toBe(true);
      expect(ctx.bot.sendDocument).toHaveBeenCalled();
      expect(mockDeleteFile).toHaveBeenCalledWith(3);
    });
  });
});
