/**
 * Unit tests for get_kimi_balance tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

vi.mock('../../../../config.js', () => ({
  APIS: { KIMI_API_KEY: 'test-kimi-key' },
  PATHS: { KIMI_KEY_FILE: '/tmp/kimi_key' },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { getKimiBalanceHandler, getKimiBalanceDefinition } from '../../get-kimi-balance.js';

describe('get_kimi_balance tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(getKimiBalanceHandler.name).toBe('get_kimi_balance');
    });

    it('should expose the definition', () => {
      expect(getKimiBalanceHandler.definition).toBe(getKimiBalanceDefinition);
    });

    it('should have no required properties', () => {
      expect(getKimiBalanceDefinition.input_schema.required).toEqual([]);
    });
  });

  describe('execute', () => {
    it('should return balance on successful API call', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 0,
          status: true,
          data: {
            available_balance: 25.50,
            voucher_balance: 10.00,
            cash_balance: 15.50,
          },
        }),
      });

      const result = await getKimiBalanceHandler.execute({}, ctx);

      expect(result.success).toBe(true);
      expect(result.available_balance).toBe(25.50);
      expect(result.voucher_balance).toBe(10.00);
      expect(result.cash_balance).toBe(15.50);
      expect(result.currency).toBe('USD');
      expect(result.message).toContain('25.50');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.moonshot.ai/v1/users/me/balance',
        {
          headers: {
            'Authorization': 'Bearer test-kimi-key',
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('should return error when API responds with non-ok status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      });

      const result = await getKimiBalanceHandler.execute({}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
      expect(result.error).toContain('Unauthorized');
    });

    it('should return error when API returns non-zero code', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 1001,
          status: false,
          scode: 500,
        }),
      });

      const result = await getKimiBalanceHandler.execute({}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('1001');
      expect(result.error).toContain('500');
    });

    it('should return error when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await getKimiBalanceHandler.execute({}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('no API key', () => {
    it('should return error when no API key is configured', async () => {
      // Re-import with empty key to test this path
      // Since the mock is already set, we test via a separate approach:
      // We mock the config to return empty key
      const { APIS } = await import('../../../../config.js');
      const originalKey = APIS.KIMI_API_KEY;
      APIS.KIMI_API_KEY = '';

      const result = await getKimiBalanceHandler.execute({}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Clé API Kimi non configurée');

      // Restore
      APIS.KIMI_API_KEY = originalKey;
    });
  });
});
