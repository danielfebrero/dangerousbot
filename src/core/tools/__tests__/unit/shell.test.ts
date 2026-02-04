/**
 * Unit tests for shell tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shellHandler } from '../../shell.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';

describe('shell tool', () => {
  let ctx: ReturnType<typeof createMockToolContext>;
  let mockShell: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockShell = vi.fn().mockResolvedValue({ success: true, stdout: 'output', stderr: '', exitCode: 0 });
    ctx = createMockToolContext({
      executor: {
        ...createMockToolContext().executor,
        shell: mockShell,
      },
    });
  });

  describe('definition', () => {
    it('should have name "shell"', () => {
      expect(shellHandler.name).toBe('shell');
    });

    it('should have a definition with input_schema', () => {
      expect(shellHandler.definition).toBeDefined();
      expect(shellHandler.definition.name).toBe('shell');
      expect(shellHandler.definition.input_schema).toBeDefined();
      expect(shellHandler.definition.input_schema.required).toContain('command');
    });
  });

  describe('execute', () => {
    it('should execute a command successfully', async () => {
      const result = await shellHandler.execute({ command: 'echo hello' }, ctx);

      expect(mockShell).toHaveBeenCalledWith('echo hello', { cwd: undefined, signal: undefined });
      expect(result).toEqual({ success: true, stdout: 'output', stderr: '', exitCode: 0 });
    });

    it('should pass cwd option to executor', async () => {
      await shellHandler.execute({ command: 'ls', cwd: '/tmp' }, ctx);

      expect(mockShell).toHaveBeenCalledWith('ls', { cwd: '/tmp', signal: undefined });
    });

    it('should pass abort signal to executor', async () => {
      const controller = new AbortController();
      ctx.abortSignal = controller.signal;

      await shellHandler.execute({ command: 'sleep 10' }, ctx);

      expect(mockShell).toHaveBeenCalledWith('sleep 10', { cwd: undefined, signal: controller.signal });
    });

    it('should detect cancellation when error contains "annulée"', async () => {
      mockShell.mockResolvedValue({ success: false, error: 'Commande annulée par le signal' });

      const result = await shellHandler.execute({ command: 'long-running' }, ctx);

      expect(result).toEqual({
        success: false,
        cancelled: true,
        error: 'Commande shell annulée par l\'utilisateur',
      });
    });

    it('should return executor result directly on non-cancel failure', async () => {
      const failResult = { success: false, error: 'command not found', exitCode: 127 };
      mockShell.mockResolvedValue(failResult);

      const result = await shellHandler.execute({ command: 'nonexistent' }, ctx);

      expect(result).toEqual(failResult);
    });
  });
});
