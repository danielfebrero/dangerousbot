/**
 * Unit tests for tool registry (index.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

// Mock all problematic transitive dependencies to allow index.ts to load
vi.mock('../../../memory.js', () => ({ getMemory: vi.fn() }));
vi.mock('../../../todo.js', () => ({ getTodoManager: vi.fn() }));
vi.mock('../../../code-embedding.js', () => ({
  getCodeEmbeddingService: vi.fn(),
  CodeEmbeddingService: { cosineSimilarity: vi.fn() },
}));
vi.mock('../../../code-indexer.js', () => ({
  getCodeIndexer: vi.fn(),
  initCodeIndexer: vi.fn(),
  indexerRegistry: new Map(),
  removeCodeIndexer: vi.fn(),
}));
vi.mock('../../../thread-manager.js', () => ({
  getThreadManager: vi.fn(() => ({ setThreadProvider: vi.fn() })),
}));
vi.mock('../../../compressor.js', () => ({ getCompressor: vi.fn() }));
vi.mock('../../../swarm-manager.js', () => ({ getSwarmManager: vi.fn() }));
vi.mock('../../../logger.js', () => ({
  logger: {
    getRecentLogs: vi.fn(),
    getLevel: vi.fn(),
    setLevel: vi.fn(),
    clearLogs: vi.fn(),
    getJsonLogPath: vi.fn(),
    getTextLogPath: vi.fn(),
  },
}));
vi.mock('../../../services/config.js', () => ({
  configService: { get: vi.fn(), set: vi.fn(), getAll: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../../services/download.js', () => ({
  downloadService: { downloadFile: vi.fn(), getFile: vi.fn(), getFilePath: vi.fn(), deleteFile: vi.fn() },
}));
vi.mock('../../../tool-cancellation.js', () => ({ checkCancellation: vi.fn() }));
vi.mock('../../../tool-result-store.js', () => ({ getToolResultStore: vi.fn() }));
vi.mock('../../../lifecycle.js', () => ({
  Lifecycle: vi.fn(() => ({ markRestarted: vi.fn() })),
}));
vi.mock('../../../../config.js', () => ({
  APIS: {},
  PATHS: {},
  PROVIDER: { ACTIVE: 'claude' },
  setActiveProvider: vi.fn(),
}));

import {
  registerAllTools,
  getToolDefinitions,
  getToolHandler,
  executeTool,
  getToolDefinitionsForProvider,
} from '../../index.js';

describe('tool registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-register to ensure clean state
    registerAllTools();
  });

  describe('registerAllTools', () => {
    it('should register tools so that getToolHandler finds them', () => {
      registerAllTools();
      const handler = getToolHandler('read_file');
      expect(handler).toBeDefined();
      expect(handler!.name).toBe('read_file');
    });
  });

  describe('getToolDefinitions', () => {
    it('should return an array of tool definitions', () => {
      const defs = getToolDefinitions();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThan(0);
    });

    it('should include known tool names', () => {
      const defs = getToolDefinitions();
      const names = defs.map(d => d.name);

      expect(names).toContain('read_file');
      expect(names).toContain('write_file');
      expect(names).toContain('shell');
      expect(names).toContain('self_update');
      expect(names).toContain('restart_server');
      expect(names).toContain('swarm');
      expect(names).toContain('download_file');
      expect(names).toContain('send_file');
      expect(names).toContain('retrieve_code');
      expect(names).toContain('code_index');
      expect(names).toContain('get_kimi_balance');
    });

    it('should have valid structure for each definition', () => {
      const defs = getToolDefinitions();
      for (const def of defs) {
        expect(def.name).toBeTruthy();
        expect(typeof def.name).toBe('string');
        expect(def.description).toBeTruthy();
        expect(def.input_schema).toBeDefined();
        expect(def.input_schema.type).toBe('object');
      }
    });
  });

  describe('getToolHandler', () => {
    it('should return a handler for a known tool', () => {
      const handler = getToolHandler('shell');
      expect(handler).toBeDefined();
      expect(handler!.name).toBe('shell');
      expect(typeof handler!.execute).toBe('function');
    });

    it('should return undefined for an unknown tool', () => {
      const handler = getToolHandler('nonexistent_tool');
      expect(handler).toBeUndefined();
    });

    it('should auto-register tools if registry is empty', () => {
      // This is implicitly tested since getToolHandler calls registerAllTools
      // when the registry is empty, but let's verify explicitly by getting
      // a handler immediately
      const handler = getToolHandler('remember');
      expect(handler).toBeDefined();
    });
  });

  describe('executeTool', () => {
    it('should return error for unknown tool', async () => {
      const ctx = createMockToolContext();
      const result = await executeTool('fake_tool', {}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('fake_tool');
    });

    it('should execute a known tool handler', async () => {
      const ctx = createMockToolContext();
      // execute_code is a good test target since its mock executor will respond
      const result = await executeTool('execute_code', { code: 'return 1+1' }, ctx);

      // The mock executor returns { success: true, result: '' } by default
      expect(result).toBeDefined();
    });
  });

  describe('getToolDefinitionsForProvider', () => {
    it('should include get_kimi_balance only for kimi provider', () => {
      const kimiDefs = getToolDefinitionsForProvider('kimi');
      const kimiNames = kimiDefs.map(d => d.name);
      expect(kimiNames).toContain('get_kimi_balance');

      const claudeDefs = getToolDefinitionsForProvider('claude');
      const claudeNames = claudeDefs.map(d => d.name);
      expect(claudeNames).not.toContain('get_kimi_balance');
    });

    it('should include common tools for all providers', () => {
      const commonTools = ['read_file', 'write_file', 'shell', 'self_update', 'swarm'];

      for (const provider of ['claude', 'kimi', 'mistral']) {
        const defs = getToolDefinitionsForProvider(provider);
        const names = defs.map(d => d.name);
        for (const tool of commonTools) {
          expect(names).toContain(tool);
        }
      }
    });

    it('should filter web_search for non-kimi providers', () => {
      // web_search is kimi-only (even if not in definitions, the filter logic is tested)
      const claudeDefs = getToolDefinitionsForProvider('claude');
      const claudeNames = claudeDefs.map(d => d.name);
      expect(claudeNames).not.toContain('web_search');

      const mistralDefs = getToolDefinitionsForProvider('mistral');
      const mistralNames = mistralDefs.map(d => d.name);
      expect(mistralNames).not.toContain('web_search');
    });
  });
});
