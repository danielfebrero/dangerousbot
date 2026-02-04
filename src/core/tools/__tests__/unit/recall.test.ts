/**
 * Unit tests for recall tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recallHandler } from '../../recall.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';

describe('recall tool', () => {
  let ctx: ReturnType<typeof createMockToolContext>;

  beforeEach(() => {
    ctx = createMockToolContext({
      memory: {
        ...createMockToolContext().memory,
        getKnowledge: vi.fn().mockReturnValue([
          { type: 'fact', content: 'The sky is blue' },
          { type: 'preference', content: 'User likes dark mode' },
        ]),
      },
    });
  });

  it('should have the correct name', () => {
    expect(recallHandler.name).toBe('recall');
  });

  it('should retrieve all knowledge when no type is specified', async () => {
    const result = await recallHandler.execute({}, ctx);

    expect(ctx.memory.getKnowledge).toHaveBeenCalledWith(undefined);
    expect(result.success).toBe(true);
    expect(result.knowledge).toHaveLength(2);
  });

  it('should retrieve knowledge filtered by type', async () => {
    (ctx.memory.getKnowledge as ReturnType<typeof vi.fn>).mockReturnValue([
      { type: 'fact', content: 'The sky is blue' },
    ]);

    const result = await recallHandler.execute({ type: 'fact' }, ctx);

    expect(ctx.memory.getKnowledge).toHaveBeenCalledWith('fact');
    expect(result.success).toBe(true);
    expect(result.knowledge).toHaveLength(1);
    expect(result.knowledge[0].type).toBe('fact');
  });

  it('should return empty array when no knowledge exists', async () => {
    (ctx.memory.getKnowledge as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const result = await recallHandler.execute({}, ctx);

    expect(result.success).toBe(true);
    expect(result.knowledge).toHaveLength(0);
  });

  it('should pass preference type to getKnowledge', async () => {
    await recallHandler.execute({ type: 'preference' }, ctx);

    expect(ctx.memory.getKnowledge).toHaveBeenCalledWith('preference');
  });

  it('should pass context type to getKnowledge', async () => {
    await recallHandler.execute({ type: 'context' }, ctx);

    expect(ctx.memory.getKnowledge).toHaveBeenCalledWith('context');
  });

  it('should pass skill type to getKnowledge', async () => {
    await recallHandler.execute({ type: 'skill' }, ctx);

    expect(ctx.memory.getKnowledge).toHaveBeenCalledWith('skill');
  });
});
