/**
 * Unit tests for swarm tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const { mockSwarmManager } = vi.hoisted(() => ({
  mockSwarmManager: {
    createSwarm: vi.fn(),
    addAgent: vi.fn(),
    getAgentInfo: vi.fn(),
    continueAgent: vi.fn(),
  },
}));

vi.mock('../../../swarm-manager.js', () => ({
  getSwarmManager: vi.fn(() => mockSwarmManager),
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

    it('should require the action property', () => {
      expect(swarmDefinition.input_schema.required).toContain('action');
    });
  });

  describe('create', () => {
    it('should create a swarm with queries', async () => {
      mockSwarmManager.createSwarm.mockResolvedValue({
        swarm_id: 'swarm-1',
        agents: [
          { agent_id: 'agent-1', status: 'running', query: 'Query one text' },
          { agent_id: 'agent-2', status: 'running', query: 'Query two text' },
        ],
      });

      const result = await swarmHandler.execute(
        { action: 'create', queries: 'Query one text|||Query two text' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.swarm_id).toBe('swarm-1');
      expect(result.agents).toHaveLength(2);
      expect(result.agents[0].agent_id).toBe('agent-1');
      expect(result.agents[1].agent_id).toBe('agent-2');
      expect(mockSwarmManager.createSwarm).toHaveBeenCalledWith([
        'Query one text',
        'Query two text',
      ]);
    });

    it('should return error when queries is missing', async () => {
      const result = await swarmHandler.execute({ action: 'create' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('queries');
    });

    it('should return error when queries string is empty after split', async () => {
      const result = await swarmHandler.execute(
        { action: 'create', queries: '|||' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('query valide');
    });
  });

  describe('add', () => {
    it('should add an agent to a swarm', async () => {
      mockSwarmManager.addAgent.mockResolvedValue({
        agent_id: 'agent-3',
        status: 'running',
      });

      const result = await swarmHandler.execute(
        { action: 'add', swarm_id: 'swarm-1', query: 'New task' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.agent_id).toBe('agent-3');
      expect(mockSwarmManager.addAgent).toHaveBeenCalledWith('swarm-1', 'New task');
    });

    it('should return error when swarm_id is missing', async () => {
      const result = await swarmHandler.execute(
        { action: 'add', query: 'Some query' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('swarm_id');
    });

    it('should return error when query is missing', async () => {
      const result = await swarmHandler.execute(
        { action: 'add', swarm_id: 'swarm-1' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });
  });

  describe('retrieve', () => {
    it('should retrieve agent info when found', async () => {
      mockSwarmManager.getAgentInfo.mockReturnValue({
        agent_id: 'agent-1',
        status: 'completed',
        result: 'Done',
        error: null,
        tool_calls_count: 5,
        iterations: 3,
        created_at: 1700000000000,
        completed_at: 1700000060000,
      });

      const result = await swarmHandler.execute(
        { action: 'retrieve', agent_id: 'agent-1' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.agent_id).toBe('agent-1');
      expect(result.status).toBe('completed');
      expect(result.result).toBe('Done');
      expect(result.tool_calls_count).toBe(5);
      expect(result.iterations).toBe(3);
      expect(result.message).toContain('terminé');
    });

    it('should return error when agent is not found', async () => {
      mockSwarmManager.getAgentInfo.mockReturnValue(null);

      const result = await swarmHandler.execute(
        { action: 'retrieve', agent_id: 'nonexistent' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(result.error).toContain('introuvable');
    });

    it('should return error when agent_id is missing', async () => {
      const result = await swarmHandler.execute({ action: 'retrieve' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('agent_id');
    });

    it('should show error message for agents in error status', async () => {
      mockSwarmManager.getAgentInfo.mockReturnValue({
        agent_id: 'agent-err',
        status: 'error',
        result: null,
        error: 'Something failed',
        tool_calls_count: 2,
        iterations: 1,
        created_at: 1700000000000,
        completed_at: 1700000010000,
      });

      const result = await swarmHandler.execute(
        { action: 'retrieve', agent_id: 'agent-err' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('error');
      expect(result.message).toContain('erreur');
    });

    it('should show in-progress message for running agents', async () => {
      mockSwarmManager.getAgentInfo.mockReturnValue({
        agent_id: 'agent-running',
        status: 'running',
        result: null,
        error: null,
        tool_calls_count: 1,
        iterations: 2,
        created_at: 1700000000000,
        completed_at: null,
      });

      const result = await swarmHandler.execute(
        { action: 'retrieve', agent_id: 'agent-running' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('running');
      expect(result.message).toContain('en cours');
      expect(result.completed_at).toBeUndefined();
    });
  });

  describe('continue', () => {
    it('should continue an agent with a new query', async () => {
      mockSwarmManager.continueAgent.mockResolvedValue({
        agent_id: 'agent-1',
        status: 'running',
      });

      const result = await swarmHandler.execute(
        { action: 'continue', agent_id: 'agent-1', query: 'Follow-up task' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.agent_id).toBe('agent-1');
      expect(mockSwarmManager.continueAgent).toHaveBeenCalledWith('agent-1', 'Follow-up task');
    });

    it('should return error when agent_id is missing', async () => {
      const result = await swarmHandler.execute(
        { action: 'continue', query: 'Follow-up' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('agent_id');
    });

    it('should return error when query is missing', async () => {
      const result = await swarmHandler.execute(
        { action: 'continue', agent_id: 'agent-1' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });
  });

  describe('unknown action', () => {
    it('should return error for unknown action', async () => {
      const result = await swarmHandler.execute({ action: 'destroy' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('destroy');
      expect(result.error).toContain('inconnue');
    });
  });

  describe('error handling', () => {
    it('should catch and return errors from swarm manager', async () => {
      mockSwarmManager.createSwarm.mockRejectedValue(new Error('Max agents reached'));

      const result = await swarmHandler.execute(
        { action: 'create', queries: 'Some query' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max agents reached');
    });
  });
});
