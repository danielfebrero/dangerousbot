/**
 * Unit tests for restart_server tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const { mockMarkRestarted } = vi.hoisted(() => ({
  mockMarkRestarted: vi.fn(),
}));

vi.mock('../../../lifecycle.js', () => ({
  Lifecycle: vi.fn(() => ({ markRestarted: mockMarkRestarted })),
}));

import { restartServerHandler, restartServerDefinition } from '../../restart-server.js';

describe('restart_server tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).__pendingRestart;
    ctx = createMockToolContext({
      threadId: 'thread-42',
      source: 'webapp',
    });
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(restartServerHandler.name).toBe('restart_server');
    });

    it('should expose the definition', () => {
      expect(restartServerHandler.definition).toBe(restartServerDefinition);
    });

    it('should have reason as an optional property', () => {
      const props = restartServerDefinition.input_schema.properties;
      expect(props.reason).toBeDefined();
      // reason is not in required
      expect(restartServerDefinition.input_schema.required).not.toContain('reason');
    });
  });

  describe('execute', () => {
    it('should restart successfully with a custom reason', async () => {
      const result = await restartServerHandler.execute(
        { reason: 'Applying new config' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.needsRestart).toBe(true);
      expect(result.message).toContain('Applying new config');
      expect(mockMarkRestarted).toHaveBeenCalledWith(
        'Applying new config',
        'thread-42',
        'webapp',
        undefined,
      );
    });

    it('should use default reason when none provided', async () => {
      const result = await restartServerHandler.execute({}, ctx);

      expect(result.success).toBe(true);
      expect(result.needsRestart).toBe(true);
      expect(mockMarkRestarted).toHaveBeenCalledWith(
        'Demandé par le bot',
        'thread-42',
        'webapp',
        undefined,
      );
    });

    it('should set global.__pendingRestart', async () => {
      await restartServerHandler.execute({ reason: 'Test restart' }, ctx);

      expect((global as any).__pendingRestart).toEqual({
        reason: 'Test restart',
        threadId: 'thread-42',
        source: 'webapp',
        telegramUserId: undefined,
      });
    });

    it('should pass telegramUserId from context', async () => {
      ctx = createMockToolContext({
        threadId: 'tg-thread',
        source: 'telegram',
        telegramUserId: 98765,
      });

      await restartServerHandler.execute({ reason: 'Telegram restart' }, ctx);

      expect(mockMarkRestarted).toHaveBeenCalledWith(
        'Telegram restart',
        'tg-thread',
        'telegram',
        98765,
      );
      expect((global as any).__pendingRestart).toEqual({
        reason: 'Telegram restart',
        threadId: 'tg-thread',
        source: 'telegram',
        telegramUserId: 98765,
      });
    });
  });
});
