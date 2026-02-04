/**
 * Unit tests for swarm tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const { mockExecuteSwarm } = vi.hoisted(() => ({
  mockExecuteSwarm: vi.fn(),
}));

vi.mock('../../../swarm-manager.js', () => ({
  executeSwarm: mockExecuteSwarm,
}));

import { swarmHandler, swarmDefinition } from '../../swarm.js';

describe('swarm tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(swarmHandler.name).toBe('swarm');
    });

    it('should expose the definition', () => {
      expect(swarmHandler.definition).toBe(swarmDefinition);
    });

    it('should require the queries property', () => {
      expect(swarmDefinition.input_schema.required).toContain('queries');
    });

    it('should have queries as a string property', () => {
      expect(swarmDefinition.input_schema.properties.queries.type).toBe('string');
    });
  });

  describe('execute with queries', () => {
    it('should execute swarm with parsed queries', async () => {
      mockExecuteSwarm.mockResolvedValue({
        success: true,
        results: [
          { success: true, query: 'Query one', result: 'Result one' },
          { success: true, query: 'Query two', result: 'Result two' },
        ],
      });

      const result = await swarmHandler.execute(
        { queries: 'Query one|||Query two' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.message).toContain('2/2');
      expect(mockExecuteSwarm).toHaveBeenCalledWith(['Query one', 'Query two']);
    });

    it('should trim whitespace from queries', async () => {
      mockExecuteSwarm.mockResolvedValue({
        success: true,
        results: [{ success: true, query: 'Q1', result: 'R1' }],
      });

      await swarmHandler.execute(
        { queries: '  Q1  |||  ' },
        ctx,
      );

      expect(mockExecuteSwarm).toHaveBeenCalledWith(['Q1']);
    });

    it('should filter out empty queries', async () => {
      mockExecuteSwarm.mockResolvedValue({
        success: true,
        results: [{ success: true, query: 'Q1', result: 'R1' }],
      });

      await swarmHandler.execute(
        { queries: 'Q1||||||' },
        ctx,
      );

      expect(mockExecuteSwarm).toHaveBeenCalledWith(['Q1']);
    });

    it('should handle single query', async () => {
      mockExecuteSwarm.mockResolvedValue({
        success: true,
        results: [{ success: true, query: 'Single', result: 'Done' }],
      });

      const result = await swarmHandler.execute(
        { queries: 'Single' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('1/1');
      expect(mockExecuteSwarm).toHaveBeenCalledWith(['Single']);
    });

    it('should report partial success', async () => {
      mockExecuteSwarm.mockResolvedValue({
        success: false,
        results: [
          { success: true, query: 'Q1', result: 'Done' },
          { success: false, query: 'Q2', error: 'Failed' },
        ],
      });

      const result = await swarmHandler.execute(
        { queries: 'Q1|||Q2' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('1/2');
    });
  });

  describe('error handling', () => {
    it('should return error when queries is missing', async () => {
      const result = await swarmHandler.execute({}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('queries');
    });

    it('should return error when queries string is empty after split', async () => {
      const result = await swarmHandler.execute(
        { queries: '|||' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('query valide');
    });

    it('should catch and return errors from executeSwarm', async () => {
      mockExecuteSwarm.mockRejectedValue(new Error('Max agents reached'));

      const result = await swarmHandler.execute(
        { queries: 'Some query' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max agents reached');
    });
  });
});
