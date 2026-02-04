/**
 * Unit tests for self_update tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

vi.mock('../../../memory.js', () => ({
  getMemory: vi.fn(() => ({})),
}));

vi.mock('../../../code-embedding.js', () => ({
  getCodeEmbeddingService: vi.fn(() => ({})),
}));

vi.mock('../../../code-indexer.js', () => ({
  getCodeIndexer: vi.fn(() => ({
    indexModifiedFiles: vi.fn().mockResolvedValue({ indexed: 0, updated: 0, deleted: 0 }),
  })),
}));

const { mockMarkRestarted } = vi.hoisted(() => ({
  mockMarkRestarted: vi.fn(),
}));

vi.mock('../../../lifecycle.js', () => ({
  Lifecycle: vi.fn(() => ({ markRestarted: mockMarkRestarted })),
}));

import { selfUpdateHandler, selfUpdateDefinition } from '../../self-update.js';

describe('self_update tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).__pendingRestart;
    (global as any).__busyThreads = new Set<string>();
    delete (global as any).__currentClientId;
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(selfUpdateHandler.name).toBe('self_update');
    });

    it('should expose the definition', () => {
      expect(selfUpdateHandler.definition).toBe(selfUpdateDefinition);
    });
  });

  describe('busy threads rejection', () => {
    it('should reject when other threads are busy', async () => {
      (global as any).__busyThreads = new Set(['client-A', 'client-B']);
      (global as any).__currentClientId = 'client-A';

      const result = await selfUpdateHandler.execute({ reason: 'Update' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('BUSY');
      expect(result.busyThreads).toBe(1);
      expect(result.canForce).toBe(true);
    });

    it('should allow update when force is true despite busy threads', async () => {
      (global as any).__busyThreads = new Set(['client-A', 'client-B']);
      (global as any).__currentClientId = 'client-A';

      const mockRollbackManager = {
        safeUpdate: vi.fn().mockResolvedValue({ success: true, message: 'OK', backupId: 'bk1' }),
        getModifiedFiles: vi.fn().mockResolvedValue([]),
        getNewFiles: vi.fn().mockResolvedValue([]),
        getDeletedFiles: vi.fn().mockResolvedValue([]),
      };
      ctx = createMockToolContext({ rollbackManager: mockRollbackManager });
      ctx.versioning.commitChanges = vi.fn().mockResolvedValue({ version: '0.1.100' });

      const result = await selfUpdateHandler.execute(
        { reason: 'Force update', force: true },
        ctx,
      );

      expect(result.success).toBe(true);
    });

    it('should not reject when only the current client is busy', async () => {
      (global as any).__busyThreads = new Set(['client-A']);
      (global as any).__currentClientId = 'client-A';

      const mockRollbackManager = {
        safeUpdate: vi.fn().mockResolvedValue({ success: true, message: 'OK', backupId: 'bk1' }),
        getModifiedFiles: vi.fn().mockResolvedValue([]),
        getNewFiles: vi.fn().mockResolvedValue([]),
        getDeletedFiles: vi.fn().mockResolvedValue([]),
      };
      ctx = createMockToolContext({ rollbackManager: mockRollbackManager });
      ctx.versioning.commitChanges = vi.fn().mockResolvedValue({ version: '0.1.100' });

      const result = await selfUpdateHandler.execute({ reason: 'Update' }, ctx);

      expect(result.success).toBe(true);
    });
  });

  describe('rollback mode', () => {
    it('should succeed with rollback manager', async () => {
      const mockRollbackManager = {
        safeUpdate: vi.fn().mockResolvedValue({ success: true, message: 'Build OK', backupId: 'bk-42' }),
        getModifiedFiles: vi.fn().mockResolvedValue([]),
        getNewFiles: vi.fn().mockResolvedValue([]),
        getDeletedFiles: vi.fn().mockResolvedValue([]),
      };
      ctx = createMockToolContext({
        rollbackManager: mockRollbackManager,
        threadId: 'thread-1',
        source: 'webapp',
      });
      ctx.versioning.commitChanges = vi.fn().mockResolvedValue({ version: '0.1.100' });

      const result = await selfUpdateHandler.execute(
        { reason: 'Add feature' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.needsRestart).toBe(true);
      expect(result.version).toBe('0.1.100');
      expect(result.backupId).toBe('bk-42');
      expect(result.message).toContain('Build OK');
      expect(mockRollbackManager.safeUpdate).toHaveBeenCalled();
      expect(ctx.versioning.commitChanges).toHaveBeenCalledWith('Add feature');
      expect(mockMarkRestarted).toHaveBeenCalledWith('Add feature', 'thread-1', 'webapp', undefined);
      expect((global as any).__pendingRestart).toEqual({
        reason: 'Add feature',
        threadId: 'thread-1',
        source: 'webapp',
        telegramUserId: undefined,
      });
    });

    it('should return failure when rollback manager fails', async () => {
      const mockRollbackManager = {
        safeUpdate: vi.fn().mockResolvedValue({
          success: false,
          error: 'TypeScript error',
          message: 'Build failed, rolled back',
          backupId: 'bk-err',
        }),
        getModifiedFiles: vi.fn().mockResolvedValue([]),
        getNewFiles: vi.fn().mockResolvedValue([]),
        getDeletedFiles: vi.fn().mockResolvedValue([]),
      };
      ctx = createMockToolContext({ rollbackManager: mockRollbackManager });

      const result = await selfUpdateHandler.execute({ reason: 'Bad update' }, ctx);

      expect(result.success).toBe(false);
      expect(result.rollback).toBe(true);
      expect(result.error).toBe('TypeScript error');
      expect(result.backupId).toBe('bk-err');
    });

    it('should index modified files after successful update', async () => {
      const mockRollbackManager = {
        safeUpdate: vi.fn().mockResolvedValue({ success: true, message: 'OK', backupId: 'bk-idx' }),
        getModifiedFiles: vi.fn().mockResolvedValue(['src/main.ts']),
        getNewFiles: vi.fn().mockResolvedValue(['src/new.ts']),
        getDeletedFiles: vi.fn().mockResolvedValue([]),
      };
      ctx = createMockToolContext({ rollbackManager: mockRollbackManager });
      ctx.versioning.commitChanges = vi.fn().mockResolvedValue({ version: '0.1.101' });

      const result = await selfUpdateHandler.execute({ reason: 'Update with files' }, ctx);

      expect(result.success).toBe(true);
      expect(mockRollbackManager.getModifiedFiles).toHaveBeenCalled();
      expect(mockRollbackManager.getNewFiles).toHaveBeenCalled();
      expect(mockRollbackManager.getDeletedFiles).toHaveBeenCalled();
    });
  });

  describe('legacy mode (no rollbackManager)', () => {
    it('should build and version in legacy mode', async () => {
      ctx = createMockToolContext({ rollbackManager: null });
      const mockShell = vi.fn().mockResolvedValue({ success: true, stdout: 'Build complete' });
      ctx.executor.shell = mockShell;
      ctx.versioning.commitChanges = vi.fn().mockResolvedValue({ success: true, version: '0.1.99' });

      const result = await selfUpdateHandler.execute({ reason: 'Legacy update' }, ctx);

      expect(result.success).toBe(true);
      expect(result.needsRestart).toBe(true);
      expect(result.version).toBe('0.1.99');
      expect(mockShell).toHaveBeenCalledWith('npm run build');
      expect(ctx.versioning.commitChanges).toHaveBeenCalledWith('Legacy update');
      expect(mockMarkRestarted).toHaveBeenCalled();
      expect((global as any).__pendingRestart).toBeDefined();
    });

    it('should return error when build fails in legacy mode', async () => {
      ctx = createMockToolContext({ rollbackManager: null });
      ctx.executor.shell = vi.fn().mockResolvedValue({ success: false, error: 'Build error' });

      const result = await selfUpdateHandler.execute({ reason: 'Bad build' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('compilation');
      expect(ctx.versioning.commitChanges).not.toHaveBeenCalled();
    });

    it('should return error when versioning fails in legacy mode', async () => {
      ctx = createMockToolContext({ rollbackManager: null });
      ctx.executor.shell = vi.fn().mockResolvedValue({ success: true, stdout: 'OK' });
      ctx.versioning.commitChanges = vi.fn().mockResolvedValue({ success: false, error: 'Git error' });

      const result = await selfUpdateHandler.execute({ reason: 'Version fail' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('versioning');
    });

    it('should use default reason when none provided', async () => {
      ctx = createMockToolContext({ rollbackManager: null });
      ctx.executor.shell = vi.fn().mockResolvedValue({ success: true, stdout: 'OK' });
      ctx.versioning.commitChanges = vi.fn().mockResolvedValue({ success: true, version: '0.1.50' });

      await selfUpdateHandler.execute({}, ctx);

      expect(ctx.versioning.commitChanges).toHaveBeenCalledWith('Mise à jour du système');
    });
  });
});
