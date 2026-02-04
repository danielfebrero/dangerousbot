/**
 * Unit tests for server routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to avoid "Cannot access before initialization" errors
const { mockMemory, mockDownloadService, mockCancelThreadExecution, mockIsExecutionActive } = vi.hoisted(() => ({
  mockMemory: {
    getStats: vi.fn().mockReturnValue({ sessions: 5, messages: 100, knowledge: 10, version: '0.1.50' }),
    getMessages: vi.fn().mockReturnValue([]),
    getSessionId: vi.fn().mockReturnValue('session-123'),
    exportSession: vi.fn().mockReturnValue([]),
    resumeLastSession: vi.fn().mockReturnValue(true),
    getKnowledge: vi.fn().mockReturnValue([]),
    getWebappSettings: vi.fn().mockReturnValue({ showAllSources: false }),
    setWebappSettings: vi.fn(),
  },
  mockDownloadService: {
    getFile: vi.fn(),
    getFilePath: vi.fn(),
    listFiles: vi.fn().mockResolvedValue([]),
    getTotalSize: vi.fn().mockResolvedValue(0),
    deleteFile: vi.fn(),
  },
  mockCancelThreadExecution: vi.fn(),
  mockIsExecutionActive: vi.fn(),
}));

vi.mock('../../../core/memory.js', () => ({
  getMemory: vi.fn(() => mockMemory),
  Memory: vi.fn(() => ({ getSessionId: vi.fn().mockReturnValue('session-new') })),
}));

vi.mock('../../../core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../core/services/download.js', () => ({
  downloadService: mockDownloadService,
}));

vi.mock('../../../core/tool-cancellation.js', () => ({
  cancelThreadExecution: mockCancelThreadExecution,
  isExecutionActive: mockIsExecutionActive,
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    createReadStream: vi.fn().mockReturnValue({ pipe: vi.fn() }),
  };
});

import { createRoutes } from '../../routes.js';
import express from 'express';
import { createServer } from 'http';

// Helper to make requests to the router
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createRoutes());
  return app;
}

// Helper to simulate request/response
function mockRes() {
  const res: any = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sendFile: vi.fn().mockReturnThis(),
  };
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}): any {
  return {
    query: {},
    params: {},
    body: {},
    ...overrides,
  };
}

describe('Server Routes', () => {
  let router: ReturnType<typeof createRoutes>;

  beforeEach(() => {
    router = createRoutes();
  });

  describe('createRoutes', () => {
    it('should return an Express router', () => {
      expect(router).toBeDefined();
      expect(typeof router).toBe('function'); // Express router is a function
    });
  });

  describe('GET /health', () => {
    it('should return health status with stats', () => {
      const req = mockReq();
      const res = mockRes();

      // Find the health route handler
      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/health' && l.route?.methods?.get
      );
      expect(layer).toBeDefined();

      layer.route.stack[0].handle(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          timestamp: expect.any(String),
          version: '0.1.50',
          uptime: expect.any(Number),
          memory: expect.objectContaining({
            heapUsed: expect.any(Number),
            heapTotal: expect.any(Number),
          }),
          stats: { sessions: 5, messages: 100, knowledge: 10 },
        })
      );
    });
  });

  describe('GET /stats', () => {
    it('should return memory stats', () => {
      const req = mockReq();
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/stats' && l.route?.methods?.get
      );
      layer.route.stack[0].handle(req, res);

      expect(mockMemory.getStats).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ sessions: 5, messages: 100, knowledge: 10, version: '0.1.50' });
    });
  });

  describe('GET /history', () => {
    it('should return session messages', () => {
      mockMemory.getMessages.mockReturnValueOnce([
        { role: 'user', content: 'hello', timestamp: '2024-01-01', tool_calls: undefined },
      ]);

      const req = mockReq();
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/history' && l.route?.methods?.get
      );
      layer.route.stack[0].handle(req, res);

      expect(res.json).toHaveBeenCalledWith({
        session_id: 'session-123',
        messages: [{ role: 'user', content: 'hello', timestamp: '2024-01-01', tool_calls: undefined }],
      });
    });
  });

  describe('GET /knowledge', () => {
    it('should return knowledge with optional type filter', () => {
      mockMemory.getKnowledge.mockReturnValueOnce([{ type: 'fact', content: 'test fact' }]);

      const req = mockReq({ query: { type: 'fact' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/knowledge' && l.route?.methods?.get
      );
      layer.route.stack[0].handle(req, res);

      expect(mockMemory.getKnowledge).toHaveBeenCalledWith('fact');
      expect(res.json).toHaveBeenCalledWith({
        knowledge: [{ type: 'fact', content: 'test fact' }],
      });
    });
  });

  describe('POST /session/resume', () => {
    it('should resume last session successfully', () => {
      mockMemory.resumeLastSession.mockReturnValueOnce(true);
      mockMemory.getMessages.mockReturnValueOnce([{ role: 'user', content: 'hi' }]);

      const req = mockReq();
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/session/resume' && l.route?.methods?.post
      );
      layer.route.stack[0].handle(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        session_id: 'session-123',
        message_count: 1,
      });
    });

    it('should handle no previous session', () => {
      mockMemory.resumeLastSession.mockReturnValueOnce(false);

      const req = mockReq();
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/session/resume' && l.route?.methods?.post
      );
      layer.route.stack[0].handle(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Aucune session précédente trouvée',
      });
    });
  });

  describe('GET /session/export', () => {
    it('should export session', () => {
      mockMemory.exportSession.mockReturnValueOnce([{ role: 'user', content: 'msg' }]);

      const req = mockReq();
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/session/export' && l.route?.methods?.get
      );
      layer.route.stack[0].handle(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'session-123',
          exported_at: expect.any(String),
          messages: [{ role: 'user', content: 'msg' }],
        })
      );
    });
  });

  describe('GET /webapp/settings', () => {
    it('should return webapp settings', () => {
      const req = mockReq();
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/webapp/settings' && l.route?.methods?.get
      );
      layer.route.stack[0].handle(req, res);

      expect(res.json).toHaveBeenCalledWith({ showAllSources: false });
    });
  });

  describe('POST /webapp/settings', () => {
    it('should update webapp settings', () => {
      const req = mockReq({ body: { showAllSources: true } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/webapp/settings' && l.route?.methods?.post
      );
      layer.route.stack[0].handle(req, res);

      expect(mockMemory.setWebappSettings).toHaveBeenCalledWith({ showAllSources: true });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        settings: { showAllSources: true },
      });
    });

    it('should reject invalid showAllSources value', () => {
      const req = mockReq({ body: { showAllSources: 'not-a-boolean' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/webapp/settings' && l.route?.methods?.post
      );
      layer.route.stack[0].handle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'showAllSources must be a boolean',
      });
    });
  });

  describe('GET /files/:id', () => {
    it('should return 400 for invalid file ID', async () => {
      const req = mockReq({ params: { id: 'abc' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/files/:id' && l.route?.methods?.get
      );
      await layer.route.stack[0].handle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when file not found in DB', async () => {
      mockDownloadService.getFile.mockResolvedValueOnce(null);

      const req = mockReq({ params: { id: '42' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/files/:id' && l.route?.methods?.get
      );
      await layer.route.stack[0].handle(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should serve file with correct headers', async () => {
      const fs = await import('fs');
      (fs.existsSync as any).mockReturnValueOnce(true);
      const mockStream = { pipe: vi.fn() };
      (fs.createReadStream as any).mockReturnValueOnce(mockStream);

      mockDownloadService.getFile.mockResolvedValueOnce({
        id: 42,
        filename: 'stored_file.pdf',
        original_name: 'doc.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        source: 'webapp',
      });
      mockDownloadService.getFilePath.mockReturnValueOnce('/downloads/stored_file.pdf');

      const req = mockReq({ params: { id: '42' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/files/:id' && l.route?.methods?.get
      );
      await layer.route.stack[0].handle(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="doc.pdf"');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '1024');
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });
  });

  describe('GET /files', () => {
    it('should list files with pagination', async () => {
      mockDownloadService.listFiles.mockResolvedValueOnce([
        { id: 1, filename: 'f1.txt', original_name: 'file1.txt', size_bytes: 100, mime_type: 'text/plain', source: 'webapp', downloaded_at: '2024-01-01' },
        { id: 2, filename: 'f2.txt', original_name: 'file2.txt', size_bytes: 200, mime_type: 'text/plain', source: 'webapp', downloaded_at: '2024-01-02' },
      ]);
      mockDownloadService.getTotalSize.mockResolvedValueOnce(300);

      const req = mockReq({ query: {} });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/files' && l.route?.methods?.get
      );
      await layer.route.stack[0].handle(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            files: expect.arrayContaining([
              expect.objectContaining({ id: 1, filename: 'file1.txt' }),
            ]),
            pagination: expect.objectContaining({ total: 2 }),
            storage: expect.objectContaining({ used: 300 }),
          }),
        })
      );
    });
  });

  describe('DELETE /files/:id', () => {
    it('should delete a file', async () => {
      mockDownloadService.deleteFile.mockResolvedValueOnce(true);

      const req = mockReq({ params: { id: '5' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/files/:id' && l.route?.methods?.delete
      );
      await layer.route.stack[0].handle(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Fichier #5 supprimé' });
    });

    it('should return 404 for non-existent file', async () => {
      mockDownloadService.deleteFile.mockResolvedValueOnce(false);

      const req = mockReq({ params: { id: '999' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/files/:id' && l.route?.methods?.delete
      );
      await layer.route.stack[0].handle(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'invalid' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/files/:id' && l.route?.methods?.delete
      );
      await layer.route.stack[0].handle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /cancel', () => {
    it('should cancel thread execution', () => {
      mockCancelThreadExecution.mockReturnValueOnce(true);

      const req = mockReq({ body: { threadId: 'thread-1' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/cancel' && l.route?.methods?.post
      );
      layer.route.stack[0].handle(req, res);

      expect(mockCancelThreadExecution).toHaveBeenCalledWith('thread-1', 'user_cancelled');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Exécution annulée' })
      );
    });

    it('should handle no active execution', () => {
      mockCancelThreadExecution.mockReturnValueOnce(false);

      const req = mockReq({ body: { threadId: 'thread-1' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/cancel' && l.route?.methods?.post
      );
      layer.route.stack[0].handle(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('should require threadId', () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/cancel' && l.route?.methods?.post
      );
      layer.route.stack[0].handle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GET /cancel/status', () => {
    it('should return execution status', () => {
      mockIsExecutionActive.mockReturnValueOnce(true);

      const req = mockReq({ query: { threadId: 'thread-1' } });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/cancel/status' && l.route?.methods?.get
      );
      layer.route.stack[0].handle(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        isActive: true,
        threadId: 'thread-1',
      });
    });

    it('should require threadId query param', () => {
      const req = mockReq({ query: {} });
      const res = mockRes();

      const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/cancel/status' && l.route?.methods?.get
      );
      layer.route.stack[0].handle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
