import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockDb = {
  prepare: vi.fn().mockReturnThis(),
  run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 0 }),
  get: vi.fn(),
  all: vi.fn().mockReturnValue([]),
  close: vi.fn(),
};

vi.mock('../../../database/index.js', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

vi.mock('../../../config.js', () => ({
  TOOL_RESULTS: {
    MAX_OUTPUT_SIZE_BYTES: 10000,
    MAX_EXECUTIONS_PER_THREAD: 100,
    RETENTION_DAYS: 30,
    SUMMARY_PREVIEW_LENGTH: 200,
  },
}));

import { ToolResultStore } from '../../tool-result-store.js';
import type { ToolExecution } from '../../tool-result-store.js';

describe('ToolResultStore', () => {
  let store: ToolResultStore;

  const sampleExecution: ToolExecution = {
    toolCallId: 'tc1',
    toolName: 'read_file',
    timestamp: '2025-01-01T00:00:00Z',
    status: 'success',
    input: { path: '/test.ts' },
    output: { success: true },
    metadata: {
      executionTimeMs: 50,
      threadId: 'thread-1',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup chaining: prepare() returns an object with run/get/all
    mockDb.prepare.mockReturnValue({
      run: mockDb.run,
      get: mockDb.get,
      all: mockDb.all,
    });
    mockDb.run.mockReturnValue({ lastInsertRowid: 1, changes: 0 });
    mockDb.get.mockReturnValue(undefined);
    mockDb.all.mockReturnValue([]);
    store = new ToolResultStore();
  });

  describe('saveToolExecution', () => {
    it('should call db.prepare and run with correct parameters', () => {
      // maybeCleanup will call prepare+get for count, so mock count below threshold
      mockDb.get.mockReturnValueOnce({ count: 1 });

      store.saveToolExecution(sampleExecution);

      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockDb.run).toHaveBeenCalledWith(
        'tc1',
        'read_file',
        '2025-01-01T00:00:00Z',
        'success',
        JSON.stringify({ path: '/test.ts' }),
        JSON.stringify({ success: true }),
        null,
        50,
        'thread-1',
        null,
      );
    });

    it('should truncate output exceeding MAX_OUTPUT_SIZE_BYTES', () => {
      const largeOutput = 'x'.repeat(20000);
      const largeExecution: ToolExecution = {
        ...sampleExecution,
        output: largeOutput,
      };

      mockDb.get.mockReturnValueOnce({ count: 1 });

      store.saveToolExecution(largeExecution);

      const runCall = mockDb.run.mock.calls[0];
      // output is the 6th argument (index 5)
      expect(runCall[5].length).toBeLessThanOrEqual(10000 + 50); // max size + truncation marker
      expect(runCall[5]).toContain('[TRUNCATED]');
    });
  });

  describe('getToolExecution', () => {
    it('should return null when execution is not found', () => {
      mockDb.get.mockReturnValueOnce(undefined);

      const result = store.getToolExecution('nonexistent');

      expect(result).toBeNull();
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should return parsed ToolExecution when found', () => {
      mockDb.get.mockReturnValueOnce({
        id: 1,
        tool_call_id: 'tc1',
        tool_name: 'read_file',
        timestamp: '2025-01-01T00:00:00Z',
        status: 'success',
        input: '{"path":"/test.ts"}',
        output: '{"success":true}',
        error: null,
        execution_time_ms: 50,
        thread_id: 'thread-1',
        message_id: null,
        created_at: '2025-01-01',
      });

      const result = store.getToolExecution('tc1');

      expect(result).not.toBeNull();
      expect(result!.toolCallId).toBe('tc1');
      expect(result!.toolName).toBe('read_file');
      expect(result!.status).toBe('success');
      expect(result!.input).toEqual({ path: '/test.ts' });
      expect(result!.output).toEqual({ success: true });
      expect(result!.error).toBeUndefined();
      expect(result!.metadata.executionTimeMs).toBe(50);
      expect(result!.metadata.threadId).toBe('thread-1');
      expect(result!.metadata.messageId).toBeUndefined();
    });
  });

  describe('listToolExecutions', () => {
    it('should return empty array when no executions exist', () => {
      mockDb.all.mockReturnValueOnce([]);

      const result = store.listToolExecutions('thread-1');

      expect(result).toEqual([]);
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should return parsed list of executions', () => {
      mockDb.all.mockReturnValueOnce([
        {
          id: 1,
          tool_call_id: 'tc1',
          tool_name: 'read_file',
          timestamp: '2025-01-01T00:00:00Z',
          status: 'success',
          input: '{"path":"/test.ts"}',
          output: '{"success":true}',
          error: null,
          execution_time_ms: 50,
          thread_id: 'thread-1',
          message_id: null,
          created_at: '2025-01-01',
        },
        {
          id: 2,
          tool_call_id: 'tc2',
          tool_name: 'write_file',
          timestamp: '2025-01-01T00:01:00Z',
          status: 'error',
          input: '{"path":"/out.ts","content":"hello"}',
          output: '{}',
          error: 'Permission denied',
          execution_time_ms: 10,
          thread_id: 'thread-1',
          message_id: 5,
          created_at: '2025-01-01',
        },
      ]);

      const result = store.listToolExecutions('thread-1', 50);

      expect(result).toHaveLength(2);
      expect(result[0].toolCallId).toBe('tc1');
      expect(result[0].toolName).toBe('read_file');
      expect(result[1].toolCallId).toBe('tc2');
      expect(result[1].status).toBe('error');
      expect(result[1].error).toBe('Permission denied');
      expect(result[1].metadata.messageId).toBe(5);
    });
  });

  describe('formatToolSummary', () => {
    it('should return formatted string with timestamp, tool name, status, and ID', () => {
      const result = store.formatToolSummary(sampleExecution);

      expect(result).toContain('2025-01-01T00:00:00Z');
      expect(result).toContain('read_file');
      expect(result).toContain('success');
      expect(result).toContain('[ID: tc1]');
    });

    it('should include error message for error executions', () => {
      const errorExecution: ToolExecution = {
        ...sampleExecution,
        status: 'error',
        error: 'Something went wrong',
        output: null,
      };

      const result = store.formatToolSummary(errorExecution);

      expect(result).toContain('error');
      expect(result).toContain('ERROR: Something went wrong');
    });
  });

  describe('getStats', () => {
    it('should return stats object with total, success, error, and oldestTimestamp', () => {
      // total count
      mockDb.get.mockReturnValueOnce({ count: 10 });
      // success count
      mockDb.get.mockReturnValueOnce({ count: 7 });
      // oldest
      mockDb.get.mockReturnValueOnce({ oldest: '2025-01-01T00:00:00Z' });

      const result = store.getStats();

      expect(result).toEqual({
        total: 10,
        success: 7,
        error: 3,
        oldestTimestamp: '2025-01-01T00:00:00Z',
      });
    });

    it('should accept optional threadId parameter', () => {
      mockDb.get.mockReturnValueOnce({ count: 5 });
      mockDb.get.mockReturnValueOnce({ count: 4 });
      mockDb.get.mockReturnValueOnce({ oldest: '2025-01-02T00:00:00Z' });

      const result = store.getStats('thread-1');

      expect(result).toEqual({
        total: 5,
        success: 4,
        error: 1,
        oldestTimestamp: '2025-01-02T00:00:00Z',
      });
    });
  });

  describe('cleanupOldExecutions', () => {
    it('should call DELETE query and return number of changes', () => {
      mockDb.run.mockReturnValueOnce({ changes: 5 });

      const result = store.cleanupOldExecutions();

      expect(mockDb.prepare).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it('should return 0 when no old executions exist', () => {
      mockDb.run.mockReturnValueOnce({ changes: 0 });

      const result = store.cleanupOldExecutions();

      expect(result).toBe(0);
    });
  });
});
