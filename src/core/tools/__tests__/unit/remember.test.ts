/**
 * Unit tests for remember tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rememberHandler } from '../../remember.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';

describe('remember tool', () => {
  let ctx: ReturnType<typeof createMockToolContext>;

  beforeEach(() => {
    ctx = createMockToolContext({
      memory: {
        ...createMockToolContext().memory,
        addKnowledge: vi.fn().mockReturnValue(42),
      },
    });
  });

  it('should have the correct name', () => {
    expect(rememberHandler.name).toBe('remember');
  });

  it('should store a fact and return success with id', async () => {
    const result = await rememberHandler.execute(
      { type: 'fact', content: 'The sky is blue' },
      ctx,
    );

    expect(ctx.memory.addKnowledge).toHaveBeenCalledWith('fact', 'The sky is blue');
    expect(result.success).toBe(true);
    expect(result.id).toBe(42);
    expect(result.message).toContain('fact');
  });

  it('should store a preference', async () => {
    const result = await rememberHandler.execute(
      { type: 'preference', content: 'User likes dark mode' },
      ctx,
    );

    expect(ctx.memory.addKnowledge).toHaveBeenCalledWith('preference', 'User likes dark mode');
    expect(result.success).toBe(true);
    expect(result.id).toBe(42);
    expect(result.message).toContain('preference');
  });

  it('should store a context', async () => {
    const result = await rememberHandler.execute(
      { type: 'context', content: 'Working on project X' },
      ctx,
    );

    expect(ctx.memory.addKnowledge).toHaveBeenCalledWith('context', 'Working on project X');
    expect(result.success).toBe(true);
    expect(result.id).toBe(42);
    expect(result.message).toContain('context');
  });

  it('should store a skill', async () => {
    const result = await rememberHandler.execute(
      { type: 'skill', content: 'Can deploy to AWS' },
      ctx,
    );

    expect(ctx.memory.addKnowledge).toHaveBeenCalledWith('skill', 'Can deploy to AWS');
    expect(result.success).toBe(true);
    expect(result.id).toBe(42);
    expect(result.message).toContain('skill');
  });

  it('should return the id from addKnowledge', async () => {
    (ctx.memory.addKnowledge as ReturnType<typeof vi.fn>).mockReturnValue(99);

    const result = await rememberHandler.execute(
      { type: 'fact', content: 'test' },
      ctx,
    );

    expect(result.id).toBe(99);
  });
});
