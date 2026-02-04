/**
 * Unit tests for execute-code tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCodeHandler } from '../../execute-code.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';

describe('execute_code tool', () => {
  let ctx: ReturnType<typeof createMockToolContext>;
  let mockExecuteInMemory: ReturnType<typeof vi.fn>;
  let mockExecuteFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExecuteInMemory = vi.fn().mockResolvedValue({ success: true, result: '' });
    mockExecuteFile = vi.fn().mockResolvedValue({ success: true, result: 'output' });
    ctx = createMockToolContext({
      executor: {
        ...createMockToolContext().executor,
        executeInMemory: mockExecuteInMemory,
        executeFile: mockExecuteFile,
      },
    });
  });

  describe('definition', () => {
    it('should have name "execute_code"', () => {
      expect(executeCodeHandler.name).toBe('execute_code');
    });

    it('should have a definition with input_schema', () => {
      expect(executeCodeHandler.definition).toBeDefined();
      expect(executeCodeHandler.definition.name).toBe('execute_code');
      expect(executeCodeHandler.definition.input_schema).toBeDefined();
      expect(executeCodeHandler.definition.input_schema.required).toContain('code');
    });
  });

  describe('execute - in-memory (default)', () => {
    it('should use executeInMemory by default', async () => {
      const result = await executeCodeHandler.execute({ code: 'console.log("hi")' }, ctx);

      expect(mockExecuteInMemory).toHaveBeenCalledWith('console.log("hi")');
      expect(mockExecuteFile).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, result: '' });
    });

    it('should use executeInMemory when in_memory is true', async () => {
      await executeCodeHandler.execute({ code: '1+1', in_memory: true }, ctx);

      expect(mockExecuteInMemory).toHaveBeenCalledWith('1+1');
      expect(mockExecuteFile).not.toHaveBeenCalled();
    });
  });

  describe('execute - file mode', () => {
    it('should use executeFile when in_memory is false', async () => {
      const result = await executeCodeHandler.execute({ code: 'process.exit(0)', in_memory: false }, ctx);

      expect(mockExecuteFile).toHaveBeenCalled();
      expect(mockExecuteInMemory).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, result: 'output' });
    });

    it('should use default filename "temp.js" when none provided', async () => {
      await executeCodeHandler.execute({ code: 'console.log(1)', in_memory: false }, ctx);

      expect(mockExecuteFile).toHaveBeenCalledWith('console.log(1)', 'temp.js', 'node', { signal: undefined });
    });

    it('should use custom filename when provided', async () => {
      await executeCodeHandler.execute({ code: 'console.log(1)', in_memory: false, filename: 'script.mjs' }, ctx);

      expect(mockExecuteFile).toHaveBeenCalledWith('console.log(1)', 'script.mjs', 'node', { signal: undefined });
    });

    it('should pass abort signal to executeFile', async () => {
      const controller = new AbortController();
      ctx.abortSignal = controller.signal;

      await executeCodeHandler.execute({ code: 'while(true){}', in_memory: false }, ctx);

      expect(mockExecuteFile).toHaveBeenCalledWith('while(true){}', 'temp.js', 'node', { signal: controller.signal });
    });

    it('should detect cancellation when error contains "annulée"', async () => {
      mockExecuteFile.mockResolvedValue({ success: false, error: 'Exécution annulée par le signal' });

      const result = await executeCodeHandler.execute({ code: 'while(true){}', in_memory: false }, ctx);

      expect(result).toEqual({
        success: false,
        cancelled: true,
        error: 'Exécution du code annulée par l\'utilisateur',
      });
    });

    it('should return executor result directly on non-cancel failure', async () => {
      const failResult = { success: false, error: 'SyntaxError: Unexpected token', result: '' };
      mockExecuteFile.mockResolvedValue(failResult);

      const result = await executeCodeHandler.execute({ code: 'invalid{{{', in_memory: false }, ctx);

      expect(result).toEqual(failResult);
    });
  });
});
