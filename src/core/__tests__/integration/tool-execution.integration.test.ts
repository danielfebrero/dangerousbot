/**
 * Integration tests for the tool execution pipeline
 *
 * Tests the full flow: registerAllTools -> getToolHandler -> execute
 * Uses mocked ToolContext but real tool handlers.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockToolContext } from '../../../__tests__/helpers/mock-tool-context.js';

// Mock file system and external dependencies
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  registerAllTools,
  getToolHandler,
  executeTool,
  getToolDefinitions,
  getToolDefinitionsForProvider,
} from '../../tools/index.js';

describe('Tool Execution Pipeline Integration', () => {
  beforeAll(() => {
    registerAllTools();
  });

  describe('tool registration', () => {
    it('should register all expected tools', () => {
      const definitions = getToolDefinitions();
      expect(definitions.length).toBeGreaterThanOrEqual(25);
    });

    it('should have unique tool names', () => {
      const definitions = getToolDefinitions();
      const names = definitions.map(d => d.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should retrieve handlers by name', () => {
      const handler = getToolHandler('read_file');
      expect(handler).toBeDefined();
      expect(handler!.name).toBe('read_file');
      expect(handler!.execute).toBeDefined();
    });

    it('should return undefined for unknown tools', () => {
      const handler = getToolHandler('nonexistent_tool');
      expect(handler).toBeUndefined();
    });
  });

  describe('tool definitions schema', () => {
    it('each tool should have required schema properties', () => {
      const definitions = getToolDefinitions();

      for (const def of definitions) {
        expect(def.name, `tool ${def.name}`).toBeDefined();
        expect(def.description, `tool ${def.name}`).toBeDefined();
        expect(def.input_schema, `tool ${def.name}`).toBeDefined();
        expect(def.input_schema.type, `tool ${def.name}`).toBe('object');
        expect(def.input_schema.properties, `tool ${def.name}`).toBeDefined();
        expect(Array.isArray(def.input_schema.required), `tool ${def.name}`).toBe(true);
      }
    });
  });

  describe('provider-specific tool filtering', () => {
    it('should include get_kimi_balance only for kimi', () => {
      const kimiTools = getToolDefinitionsForProvider('kimi');
      const claudeTools = getToolDefinitionsForProvider('claude');

      const kimiHasBalance = kimiTools.some(t => t.name === 'get_kimi_balance');
      const claudeHasBalance = claudeTools.some(t => t.name === 'get_kimi_balance');

      expect(kimiHasBalance).toBe(true);
      expect(claudeHasBalance).toBe(false);
    });
  });

  describe('executeTool', () => {
    it('should execute a tool and return result', async () => {
      const context = createMockToolContext();
      context.memory.addKnowledge = vi.fn().mockReturnValue(42);

      const result = await executeTool('remember', {
        type: 'fact',
        content: 'Test fact',
      }, context);

      expect(result.success).toBe(true);
      expect(result.id).toBe(42);
      expect(context.memory.addKnowledge).toHaveBeenCalledWith('fact', 'Test fact');
    });

    it('should return error for unknown tool', async () => {
      const context = createMockToolContext();

      const result = await executeTool('nonexistent_tool', {}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('inconnu');
    });

    it('should execute recall tool', async () => {
      const context = createMockToolContext();
      (context.memory as any).getKnowledge = vi.fn().mockReturnValue([
        { type: 'fact', content: 'The sky is blue' },
      ]);

      const result = await executeTool('recall', { type: 'fact' }, context);

      expect(result.success).toBe(true);
      expect(result.knowledge).toEqual([
        { type: 'fact', content: 'The sky is blue' },
      ]);
    });

    it('should execute read_file tool delegating to executor', async () => {
      const context = createMockToolContext();
      (context.executor as any).readFile = vi.fn().mockReturnValue({
        success: true,
        content: 'file contents',
      });

      const result = await executeTool('read_file', { path: 'test.txt' }, context);

      expect(result.success).toBe(true);
      expect(context.executor.readFile).toHaveBeenCalledWith('test.txt', undefined, undefined);
    });

    it('should execute write_file tool delegating to executor', async () => {
      const context = createMockToolContext();
      (context.executor as any).writeFile = vi.fn().mockReturnValue({
        success: true,
      });

      const result = await executeTool('write_file', {
        path: 'output.txt',
        content: 'hello',
      }, context);

      expect(result.success).toBe(true);
      expect(context.executor.writeFile).toHaveBeenCalledWith('output.txt', 'hello');
    });

    it('should execute shell tool with abort signal support', async () => {
      const context = createMockToolContext();
      (context.executor as any).shell = vi.fn().mockResolvedValue({
        success: true,
        stdout: 'output',
        stderr: '',
        exitCode: 0,
      });

      const result = await executeTool('shell', {
        command: 'echo hello',
      }, context);

      expect(result.success).toBe(true);
      expect(context.executor.shell).toHaveBeenCalledWith('echo hello', expect.objectContaining({}));
    });

    it('should execute list_files tool', async () => {
      const context = createMockToolContext();
      (context.executor as any).listFiles = vi.fn().mockReturnValue({
        success: true,
        files: ['a.ts', 'b.ts'],
      });

      const result = await executeTool('list_files', { path: '.' }, context);

      expect(result.success).toBe(true);
    });

    it('should execute delete_file tool', async () => {
      const context = createMockToolContext();
      (context.executor as any).deleteFile = vi.fn().mockReturnValue({
        success: true,
      });

      const result = await executeTool('delete_file', { path: 'temp.txt' }, context);

      expect(result.success).toBe(true);
    });

    it('should execute edit_file tool', async () => {
      const context = createMockToolContext();
      (context.executor as any).editFile = vi.fn().mockReturnValue({
        success: true,
      });

      const result = await executeTool('edit_file', {
        path: 'file.ts',
        old_string: 'old',
        new_string: 'new',
      }, context);

      expect(result.success).toBe(true);
      expect(context.executor.editFile).toHaveBeenCalledWith('file.ts', 'old', 'new', false);
    });
  });
});
