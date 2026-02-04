/**
 * Unit tests for config
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock core/memory to avoid circular dependency
vi.mock('../../core/memory', () => ({
  getMemory: vi.fn(() => ({
    getConfig: vi.fn().mockReturnValue(null),
    setConfig: vi.fn(),
  })),
}));

import {
  PROVIDER,
  MODELS,
  TOKENS,
  MEMORY,
  SERVER,
  ROLLBACK,
  TOOL_RESULTS,
  PATHS,
  APIS,
  loadApiKey,
  initializeApiKeys,
  loadTelegramUserId,
  config,
} from '../../config.js';

describe('config', () => {
  describe('constants', () => {
    it('should export PROVIDER with default ACTIVE', () => {
      expect(PROVIDER.ACTIVE).toBeDefined();
      expect(['claude', 'kimi', 'mistral', 'grok']).toContain(PROVIDER.ACTIVE);
    });

    it('should export all model identifiers', () => {
      expect(MODELS.CLAUDE).toBeDefined();
      expect(MODELS.KIMI).toBeDefined();
      expect(MODELS.MISTRAL_LARGE).toBeDefined();
      expect(MODELS.MISTRAL_MEDIUM).toBeDefined();
      expect(MODELS.MISTRAL_SMALL).toBeDefined();
      expect(MODELS.EMBEDDING).toBeDefined();
    });

    it('should export token limits', () => {
      expect(TOKENS.MAX_RESPONSE).toBeGreaterThan(0);
      expect(TOKENS.MAX_COMPRESSION_SUMMARY).toBeGreaterThan(0);
      expect(TOKENS.MAX_CONSULT_AI_RESPONSE).toBeGreaterThan(0);
    });

    it('should export memory config', () => {
      expect(MEMORY.TOKEN_LIMIT_FOR_COMPRESSION).toBeGreaterThan(0);
      expect(MEMORY.RELEVANT_MEMORIES_TOP_K).toBeGreaterThan(0);
    });

    it('should export server config', () => {
      expect(SERVER.DEFAULT_PORT).toBe(3000);
      expect(SERVER.DEFAULT_HOST).toBe('localhost');
    });

    it('should export rollback config', () => {
      expect(ROLLBACK.MAX_BACKUPS).toBeGreaterThan(0);
      expect(ROLLBACK.BACKUP_DIR).toBe('.backups');
      expect(ROLLBACK.BUILD_TIMEOUT).toBeGreaterThan(0);
    });

    it('should export tool_results config', () => {
      expect(TOOL_RESULTS.RETENTION_DAYS).toBeGreaterThan(0);
      expect(TOOL_RESULTS.MAX_OUTPUT_SIZE_BYTES).toBeGreaterThan(0);
    });

    it('should export paths with computed getters', () => {
      expect(PATHS.CONFIG_DIR).toContain('.dangerousbot');
      expect(PATHS.SECRETS_DIR).toContain('secrets');
      expect(PATHS.ANTHROPIC_KEY_FILE).toContain('anthropic_api_key');
    });
  });

  describe('loadApiKey', () => {
    it('should return key from file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('sk-test-key-123\n');
      const key = loadApiKey('/path/to/key');
      expect(key).toBe('sk-test-key-123');
    });

    it('should return empty string if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const key = loadApiKey('/path/to/key');
      expect(key).toBe('');
    });

    it('should trim whitespace', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('  key-with-spaces  \n');
      const key = loadApiKey('/path/to/key');
      expect(key).toBe('key-with-spaces');
    });

    it('should return empty string on read error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      const key = loadApiKey('/path/to/key');
      expect(key).toBe('');
    });
  });

  describe('initializeApiKeys', () => {
    it('should load all API keys from files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('test-key');
      initializeApiKeys();
      expect(APIS.MISTRAL_API_KEY).toBe('test-key');
      expect(APIS.OPENROUTER_API_KEY).toBe('test-key');
      expect(APIS.KIMI_API_KEY).toBe('test-key');
      expect(APIS.GROK_API_KEY).toBe('test-key');
    });
  });

  describe('loadTelegramUserId', () => {
    it('should parse numeric user ID', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('12345');
      const userId = loadTelegramUserId();
      expect(userId).toBe(12345);
    });

    it('should return 0 for non-numeric content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not-a-number');
      const userId = loadTelegramUserId();
      expect(userId).toBe(0);
    });

    it('should return 0 if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const userId = loadTelegramUserId();
      expect(userId).toBe(0);
    });
  });

  describe('config aggregate export', () => {
    it('should contain all config sections', () => {
      expect(config.PROVIDER).toBeDefined();
      expect(config.MODELS).toBeDefined();
      expect(config.TOKENS).toBeDefined();
      expect(config.MEMORY).toBeDefined();
      expect(config.SERVER).toBeDefined();
      expect(config.PATHS).toBeDefined();
      expect(config.APIS).toBeDefined();
      expect(config.ROLLBACK).toBeDefined();
      expect(config.TOOL_RESULTS).toBeDefined();
    });
  });
});
