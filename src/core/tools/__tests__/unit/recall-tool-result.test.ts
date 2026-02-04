/**
 * Unit tests for recall_tool_result tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recallToolResultHandler } from '../../recall-tool-result.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    getToolExecution: vi.fn(),
    formatToolSummary: vi.fn(),
  },
}));

vi.mock('../../../tool-result-store.js', () => ({
  getToolResultStore: vi.fn(() => mockStore),
}));

describe('recall_tool_result tool', () => {
  let ctx: ReturnType<typeof createMockToolContext>;

  const mockExecution = {
    toolName: 'shell',
    timestamp: '2024-01-01T00:00:00.000Z',
    status: 'success',
    input: { command: 'ls' },
    output: { files: ['a.ts'] },
    error: null,
    metadata: { executionTimeMs: 150 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have name "recall_tool_result"', () => {
      expect(recallToolResultHandler.name).toBe('recall_tool_result');
    });

    it('should have a definition with input_schema', () => {
      expect(recallToolResultHandler.definition).toBeDefined();
      expect(recallToolResultHandler.definition.name).toBe('recall_tool_result');
      expect(recallToolResultHandler.definition.input_schema).toBeDefined();
      expect(recallToolResultHandler.definition.input_schema.required).toContain('tool_call_id');
    });
  });

  describe('execute', () => {
    it('should return error when tool_call_id is missing', async () => {
      const result = await recallToolResultHandler.execute({ tool_call_id: '' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requis');
    });

    it('should return error when execution is not found', async () => {
      mockStore.getToolExecution.mockReturnValue(null);

      const result = await recallToolResultHandler.execute({ tool_call_id: 'exec-nonexistent' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Aucune exécution trouvée');
      expect(result.error).toContain('exec-nonexistent');
    });

    it('should return full execution data by default', async () => {
      mockStore.getToolExecution.mockReturnValue(mockExecution);

      const result = await recallToolResultHandler.execute({ tool_call_id: 'exec-123' }, ctx);

      expect(result.success).toBe(true);
      expect(result.toolName).toBe('shell');
      expect(result.executedAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.status).toBe('success');
      expect(result.input).toEqual({ command: 'ls' });
      expect(result.output).toEqual({ files: ['a.ts'] });
      expect(result.error).toBeNull();
      expect(result.executionTimeMs).toBe(150);
    });

    it('should return full execution data when format is "full"', async () => {
      mockStore.getToolExecution.mockReturnValue(mockExecution);

      const result = await recallToolResultHandler.execute({
        tool_call_id: 'exec-123',
        format: 'full',
      }, ctx);

      expect(result.success).toBe(true);
      expect(result.toolName).toBe('shell');
      expect(result.input).toEqual({ command: 'ls' });
      expect(result.output).toEqual({ files: ['a.ts'] });
      expect(result.executionTimeMs).toBe(150);
    });

    it('should return summary when format is "summary"', async () => {
      mockStore.getToolExecution.mockReturnValue(mockExecution);
      mockStore.formatToolSummary.mockReturnValue('shell: executed ls successfully in 150ms');

      const result = await recallToolResultHandler.execute({
        tool_call_id: 'exec-123',
        format: 'summary',
      }, ctx);

      expect(result.success).toBe(true);
      expect(result.summary).toBe('shell: executed ls successfully in 150ms');
      expect(result.toolName).toBe('shell');
      expect(result.executedAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.status).toBe('success');
      // Full fields should not be present in summary
      expect(result.input).toBeUndefined();
      expect(result.output).toBeUndefined();
      expect(mockStore.formatToolSummary).toHaveBeenCalledWith(mockExecution);
    });

    it('should return all fields correctly for a failed execution', async () => {
      const failedExecution = {
        toolName: 'read_file',
        timestamp: '2024-01-02T12:00:00.000Z',
        status: 'error',
        input: { path: '/nonexistent.ts' },
        output: null,
        error: 'File not found',
        metadata: { executionTimeMs: 5 },
      };
      mockStore.getToolExecution.mockReturnValue(failedExecution);

      const result = await recallToolResultHandler.execute({ tool_call_id: 'exec-456' }, ctx);

      expect(result.success).toBe(true);
      expect(result.toolName).toBe('read_file');
      expect(result.executedAt).toBe('2024-01-02T12:00:00.000Z');
      expect(result.status).toBe('error');
      expect(result.input).toEqual({ path: '/nonexistent.ts' });
      expect(result.output).toBeNull();
      expect(result.error).toBe('File not found');
      expect(result.executionTimeMs).toBe(5);
    });

    it('should call getToolExecution with the correct ID', async () => {
      mockStore.getToolExecution.mockReturnValue(mockExecution);

      await recallToolResultHandler.execute({ tool_call_id: 'exec-1706950500-abc123' }, ctx);

      expect(mockStore.getToolExecution).toHaveBeenCalledWith('exec-1706950500-abc123');
    });
  });
});
