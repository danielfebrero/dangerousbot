import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const { mockConfigService } = vi.hoisted(() => ({
  mockConfigService: {
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn(),
    delete: vi.fn(),
    setStorageLimitGB: vi.fn(),
  },
}));

vi.mock('../../../services/config.js', () => ({
  configService: mockConfigService,
}));

import { configHandler, configDefinition } from '../../config.js';

describe('config tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(configHandler.name).toBe('config');
    });

    it('should expose the definition', () => {
      expect(configHandler.definition).toBe(configDefinition);
    });

    it('should require the action property', () => {
      expect(configDefinition.input_schema.required).toContain('action');
    });

    it('should enumerate valid actions', () => {
      const actionProp = configDefinition.input_schema.properties.action as any;
      expect(actionProp.enum).toEqual(['get', 'set', 'list', 'delete']);
    });
  });

  describe('get action', () => {
    it('should return the value when key exists', async () => {
      mockConfigService.get.mockResolvedValue('some-value');

      const result = await configHandler.execute({ action: 'get', key: 'my_key' }, ctx);

      expect(mockConfigService.get).toHaveBeenCalledWith('my_key');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'my_key', value: 'some-value' });
      expect(result.message).toContain('my_key');
      expect(result.message).toContain('some-value');
    });

    it('should handle undefined value gracefully', async () => {
      mockConfigService.get.mockResolvedValue(undefined);

      const result = await configHandler.execute({ action: 'get', key: 'missing_key' }, ctx);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'missing_key', value: undefined });
      expect(result.message).toContain('non définie');
    });

    it('should return an error when key is missing', async () => {
      const result = await configHandler.execute({ action: 'get' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Clé requise');
      expect(mockConfigService.get).not.toHaveBeenCalled();
    });
  });

  describe('set action', () => {
    it('should set a normal key-value pair', async () => {
      mockConfigService.set.mockResolvedValue(undefined);

      const result = await configHandler.execute(
        { action: 'set', key: 'theme', value: 'dark' },
        ctx,
      );

      expect(mockConfigService.set).toHaveBeenCalledWith('theme', 'dark');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'theme', value: 'dark' });
      expect(result.message).toContain('theme');
      expect(result.message).toContain('dark');
    });

    it('should handle storage_limit_gb specially', async () => {
      mockConfigService.setStorageLimitGB.mockResolvedValue(undefined);

      const result = await configHandler.execute(
        { action: 'set', key: 'storage_limit_gb', value: '2' },
        ctx,
      );

      expect(mockConfigService.setStorageLimitGB).toHaveBeenCalledWith(2);
      expect(mockConfigService.set).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'storage_limit_gb', value: '2', bytes: 2 * 1024 * 1024 * 1024 });
      expect(result.message).toContain('2 GB');
    });

    it('should reject invalid storage_limit_gb (NaN)', async () => {
      const result = await configHandler.execute(
        { action: 'set', key: 'storage_limit_gb', value: 'abc' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalide');
      expect(mockConfigService.setStorageLimitGB).not.toHaveBeenCalled();
    });

    it('should reject invalid storage_limit_gb (zero)', async () => {
      const result = await configHandler.execute(
        { action: 'set', key: 'storage_limit_gb', value: '0' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalide');
    });

    it('should reject invalid storage_limit_gb (negative)', async () => {
      const result = await configHandler.execute(
        { action: 'set', key: 'storage_limit_gb', value: '-5' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalide');
    });

    it('should return an error when key is missing', async () => {
      const result = await configHandler.execute({ action: 'set', value: 'something' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Clé et valeur requises');
    });

    it('should return an error when value is missing', async () => {
      const result = await configHandler.execute({ action: 'set', key: 'some_key' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Clé et valeur requises');
    });
  });

  describe('list action', () => {
    it('should return all config entries', async () => {
      const allConfig = { theme: 'dark', language: 'fr', debug: 'true' };
      mockConfigService.getAll.mockResolvedValue(allConfig);

      const result = await configHandler.execute({ action: 'list' }, ctx);

      expect(mockConfigService.getAll).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(allConfig);
      expect(result.message).toContain('3');
    });

    it('should handle empty config', async () => {
      mockConfigService.getAll.mockResolvedValue({});

      const result = await configHandler.execute({ action: 'list' }, ctx);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
      expect(result.message).toContain('0');
    });
  });

  describe('delete action', () => {
    it('should delete a config entry by key', async () => {
      mockConfigService.delete.mockResolvedValue(undefined);

      const result = await configHandler.execute({ action: 'delete', key: 'theme' }, ctx);

      expect(mockConfigService.delete).toHaveBeenCalledWith('theme');
      expect(result.success).toBe(true);
      expect(result.message).toContain('theme');
      expect(result.message).toContain('supprimée');
    });

    it('should return an error when key is missing', async () => {
      const result = await configHandler.execute({ action: 'delete' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Clé requise');
      expect(mockConfigService.delete).not.toHaveBeenCalled();
    });
  });

  describe('unknown action', () => {
    it('should return an error for an unrecognized action', async () => {
      const result = await configHandler.execute({ action: 'reset' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Action inconnue');
      expect(result.error).toContain('reset');
    });
  });

  describe('error handling', () => {
    it('should catch errors from configService.get and return a failure', async () => {
      mockConfigService.get.mockRejectedValue(new Error('DB connection failed'));

      const result = await configHandler.execute({ action: 'get', key: 'anything' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Erreur config');
      expect(result.error).toContain('DB connection failed');
    });

    it('should catch errors from configService.set and return a failure', async () => {
      mockConfigService.set.mockRejectedValue(new Error('Write error'));

      const result = await configHandler.execute(
        { action: 'set', key: 'k', value: 'v' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Write error');
    });

    it('should catch errors from configService.getAll and return a failure', async () => {
      mockConfigService.getAll.mockRejectedValue(new Error('List error'));

      const result = await configHandler.execute({ action: 'list' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('List error');
    });

    it('should catch errors from configService.delete and return a failure', async () => {
      mockConfigService.delete.mockRejectedValue(new Error('Delete error'));

      const result = await configHandler.execute({ action: 'delete', key: 'k' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Delete error');
    });
  });
});
