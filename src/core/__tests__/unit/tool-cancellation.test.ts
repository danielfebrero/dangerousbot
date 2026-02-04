/**
 * Unit tests for tool-cancellation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  createExecutionContext,
  cancelThreadExecution,
  releaseExecutionContext,
  isExecutionActive,
  getActiveExecution,
  getAllActiveExecutions,
  checkCancellation,
  withCancellation,
} from '../../tool-cancellation.js';

describe('tool-cancellation', () => {
  beforeEach(() => {
    // Clean up any active executions
    for (const exec of getAllActiveExecutions()) {
      releaseExecutionContext(exec.threadId);
    }
  });

  describe('createExecutionContext', () => {
    it('should return signal and executionId', () => {
      const ctx = createExecutionContext('read_file', 'thread-1');
      expect(ctx.signal).toBeInstanceOf(AbortSignal);
      expect(ctx.executionId).toBeDefined();
      releaseExecutionContext('thread-1');
    });

    it('should mark execution as active', () => {
      createExecutionContext('shell', 'thread-2');
      expect(isExecutionActive('thread-2')).toBe(true);
      releaseExecutionContext('thread-2');
    });
  });

  describe('cancelThreadExecution', () => {
    it('should cancel active execution', () => {
      const ctx = createExecutionContext('shell', 'thread-3');
      const result = cancelThreadExecution('thread-3');
      expect(result).toBe(true);
      expect(ctx.signal.aborted).toBe(true);
      releaseExecutionContext('thread-3');
    });

    it('should return false for non-existent execution', () => {
      const result = cancelThreadExecution('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('releaseExecutionContext', () => {
    it('should remove execution from active list', () => {
      createExecutionContext('read_file', 'thread-4');
      releaseExecutionContext('thread-4');
      expect(isExecutionActive('thread-4')).toBe(false);
    });
  });

  describe('isExecutionActive', () => {
    it('should return false for no active execution', () => {
      expect(isExecutionActive('thread-none')).toBe(false);
    });
  });

  describe('getActiveExecution', () => {
    it('should return execution details', () => {
      createExecutionContext('shell', 'thread-5');
      const exec = getActiveExecution('thread-5');
      expect(exec).toBeDefined();
      expect(exec!.toolName).toBe('shell');
      expect(exec!.threadId).toBe('thread-5');
      expect(exec!.startTime).toBeInstanceOf(Date);
      releaseExecutionContext('thread-5');
    });

    it('should return undefined for non-existent', () => {
      expect(getActiveExecution('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllActiveExecutions', () => {
    it('should return all active executions', () => {
      createExecutionContext('shell', 'thread-a');
      createExecutionContext('read_file', 'thread-b');
      const all = getAllActiveExecutions();
      expect(all.length).toBeGreaterThanOrEqual(2);
      releaseExecutionContext('thread-a');
      releaseExecutionContext('thread-b');
    });
  });

  describe('checkCancellation', () => {
    it('should not throw for non-aborted signal', () => {
      const controller = new AbortController();
      expect(() => checkCancellation(controller.signal)).not.toThrow();
    });

    it('should throw for aborted signal', () => {
      const controller = new AbortController();
      controller.abort();
      expect(() => checkCancellation(controller.signal)).toThrow();
    });

    it('should not throw for undefined signal', () => {
      expect(() => checkCancellation(undefined)).not.toThrow();
    });
  });

  describe('withCancellation', () => {
    it('should execute function normally', async () => {
      const result = await withCancellation(
        async () => 42,
        'test_tool',
        'thread-wc-1'
      );
      expect(result).toBe(42);
    });

    it('should clean up after execution', async () => {
      await withCancellation(
        async () => 'done',
        'test_tool',
        'thread-wc-2'
      );
      expect(isExecutionActive('thread-wc-2')).toBe(false);
    });

    it('should clean up after error', async () => {
      await expect(
        withCancellation(
          async () => { throw new Error('fail'); },
          'test_tool',
          'thread-wc-3'
        )
      ).rejects.toThrow('fail');
      expect(isExecutionActive('thread-wc-3')).toBe(false);
    });
  });
});
