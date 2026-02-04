/**
 * Unit tests for ProviderManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProvider = {
  name: 'kimi',
  model: 'kimi-k2.5',
  chat: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Response' }],
    stopReason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
    cost: { input_cost: 0.001, output_cost: 0.005, total_cost: 0.006 },
  }),
  chatStream: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Stream response' }],
    stopReason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
    cost: { input_cost: 0.001, output_cost: 0.005, total_cost: 0.006 },
  }),
  supportsTools: vi.fn().mockReturnValue(true),
};

vi.mock('../../../providers/index.js', () => ({
  createProvider: vi.fn(() => ({ ...mockProvider })),
}));

vi.mock('../../../../config.js', () => ({
  MODELS: {
    CLAUDE: 'claude-opus-4-5',
    KIMI: 'kimi-k2.5',
    MISTRAL_LARGE: 'mistral-large',
    GROK_REASONING: 'grok-3-mini',
  },
  TOKENS: { MAX_RESPONSE: 32768 },
  APIS: {
    KIMI_API_KEY: 'env-kimi-key',
    MISTRAL_API_KEY: 'env-mistral-key',
    GROK_API_KEY: 'env-grok-key',
  },
  PROVIDER: { ACTIVE: 'kimi' },
  setActiveProvider: vi.fn(),
}));

import { ProviderManager } from '../../provider-manager.js';
import { createProvider } from '../../../providers/index.js';
import { setActiveProvider } from '../../../../config.js';

describe('ProviderManager', () => {
  let pm: ProviderManager;

  beforeEach(() => {
    vi.mocked(createProvider).mockReturnValue({ ...mockProvider });
    mockProvider.chat.mockReset().mockResolvedValue({
      content: [{ type: 'text', text: 'Response' }],
      stopReason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost: { input_cost: 0.001, output_cost: 0.005, total_cost: 0.006 },
    });
    mockProvider.chatStream.mockReset().mockResolvedValue({
      content: [{ type: 'text', text: 'Stream response' }],
      stopReason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost: { input_cost: 0.001, output_cost: 0.005, total_cost: 0.006 },
    });
    pm = new ProviderManager({ anthropic: 'test-anthropic-key' });
  });

  describe('constructor', () => {
    it('should create the current provider', () => {
      expect(createProvider).toHaveBeenCalled();
    });
  });

  describe('getCurrentProvider', () => {
    it('should return current provider info', () => {
      const info = pm.getCurrentProvider();
      expect(info.name).toBe('kimi');
      expect(info.model).toBe('kimi-k2.5');
    });
  });

  describe('switchProvider', () => {
    it('should call setActiveProvider and switch', () => {
      pm.switchProvider('claude');
      expect(setActiveProvider).toHaveBeenCalledWith('claude');
    });
  });

  describe('setKimiApiKey', () => {
    it('should clear kimi cache', () => {
      pm.setKimiApiKey('new-kimi-key');
      // After setting key, next getOrCreateProvider('kimi') should recreate
    });
  });

  describe('setOpenRouterApiKey', () => {
    it('should set the key', () => {
      pm.setOpenRouterApiKey('openrouter-key');
      // No error thrown
    });
  });

  describe('setMistralApiKey', () => {
    it('should clear mistral cache', () => {
      pm.setMistralApiKey('new-mistral-key');
      // No error
    });
  });

  describe('setGrokApiKey', () => {
    it('should clear grok cache', () => {
      pm.setGrokApiKey('new-grok-key');
      // No error
    });
  });

  describe('getOrCreateProvider', () => {
    it('should return cached provider on second call', () => {
      const p1 = pm.getOrCreateProvider('kimi');
      const p2 = pm.getOrCreateProvider('kimi');
      // Should be same reference (cached)
      expect(p1).toBe(p2);
    });

    it('should create new provider for uncached type', () => {
      pm.getOrCreateProvider('claude');
      expect(createProvider).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'claude' })
      );
    });
  });

  describe('chatWithFallback', () => {
    it('should call primary provider', async () => {
      const provider = pm.getOrCreateProvider('kimi');

      const result = await pm.chatWithFallback(
        [{ role: 'user', content: 'Hello' }],
        { system: 'System', tools: [], preferredProvider: 'kimi' }
      );

      expect(result.content).toBeDefined();
      expect(result.stopReason).toBe('end_turn');
    });

    it('should fallback to next provider on failure', async () => {
      let callCount = 0;
      vi.mocked(createProvider).mockImplementation((config: any) => {
        callCount++;
        const p = { ...mockProvider, name: config.provider, model: config.model };
        if (config.provider === 'kimi') {
          p.chat = vi.fn().mockRejectedValue(new Error('Insufficient balance'));
        } else {
          p.chat = vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Fallback response' }],
            stopReason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
          });
        }
        p.chatStream = vi.fn();
        p.supportsTools = vi.fn().mockReturnValue(true);
        return p as any;
      });

      const freshPm = new ProviderManager({ anthropic: 'test-key' });

      const result = await freshPm.chatWithFallback(
        [{ role: 'user', content: 'Hello' }],
        { system: 'System', tools: [], preferredProvider: 'kimi' }
      );

      expect(result.content[0]).toEqual({ type: 'text', text: 'Fallback response' });
    });

    it('should throw when all providers fail', async () => {
      vi.mocked(createProvider).mockImplementation(() => ({
        ...mockProvider,
        chat: vi.fn().mockRejectedValue(new Error('503 unavailable')),
        chatStream: vi.fn(),
      } as any));

      const freshPm = new ProviderManager({ anthropic: 'test-key' });

      await expect(freshPm.chatWithFallback(
        [{ role: 'user', content: 'Hello' }],
        { system: 'System', tools: [] }
      )).rejects.toThrow('All providers failed');
    });

    it('should not fallback on non-fallback errors', async () => {
      vi.mocked(createProvider).mockImplementation(() => ({
        ...mockProvider,
        chat: vi.fn().mockRejectedValue(new Error('Some unexpected error')),
        chatStream: vi.fn(),
      } as any));

      const freshPm = new ProviderManager({ anthropic: 'test-key' });

      await expect(freshPm.chatWithFallback(
        [{ role: 'user', content: 'Hello' }],
        { system: 'System', tools: [] }
      )).rejects.toThrow('Some unexpected error');
    });
  });

  describe('chatStreamWithFallback', () => {
    it('should call primary provider with streaming', async () => {
      const onChunk = vi.fn();

      const result = await pm.chatStreamWithFallback(
        [{ role: 'user', content: 'Hello' }],
        { system: 'System', tools: [], onChunk, preferredProvider: 'kimi' }
      );

      expect(result.content).toBeDefined();
    });

    it('should fallback on streaming failure', async () => {
      let isFirst = true;
      vi.mocked(createProvider).mockImplementation((config: any) => {
        const p = { ...mockProvider, name: config.provider, model: config.model };
        if (isFirst) {
          isFirst = false;
          p.chatStream = vi.fn().mockRejectedValue(new Error('Rate limit exceeded'));
          p.chat = vi.fn();
        } else {
          p.chatStream = vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Fallback stream' }],
            stopReason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
          });
          p.chat = vi.fn();
        }
        p.supportsTools = vi.fn().mockReturnValue(true);
        return p as any;
      });

      const freshPm = new ProviderManager({ anthropic: 'test-key' });

      const result = await freshPm.chatStreamWithFallback(
        [{ role: 'user', content: 'Hello' }],
        { system: 'System', tools: [], onChunk: vi.fn() }
      );

      expect(result.content[0]).toEqual({ type: 'text', text: 'Fallback stream' });
    });
  });

  describe('shouldFallback (via chatWithFallback)', () => {
    const fallbackErrors = [
      'Insufficient balance',
      'quota exceeded',
      'Rate limit reached',
      'timeout error',
      '401 Unauthorized',
      'authentication failed',
      '503 Service Unavailable',
      '502 Bad Gateway',
      '500 Internal Server Error',
      'server overloaded',
      'service unavailable',
      'invalid API key',
    ];

    for (const errorMsg of fallbackErrors) {
      it(`should fallback on "${errorMsg}"`, async () => {
        let firstCall = true;
        vi.mocked(createProvider).mockImplementation((config: any) => {
          const p = { ...mockProvider, name: config.provider, model: config.model };
          if (firstCall) {
            firstCall = false;
            p.chat = vi.fn().mockRejectedValue(new Error(errorMsg));
          } else {
            p.chat = vi.fn().mockResolvedValue({
              content: [{ type: 'text', text: 'OK' }],
              stopReason: 'end_turn',
              usage: { input_tokens: 1, output_tokens: 1 },
            });
          }
          p.chatStream = vi.fn();
          p.supportsTools = vi.fn().mockReturnValue(true);
          return p as any;
        });

        const freshPm = new ProviderManager({ anthropic: 'key' });
        const result = await freshPm.chatWithFallback(
          [{ role: 'user', content: 'Hi' }],
          { system: '', tools: [] }
        );
        expect(result.content[0]).toEqual({ type: 'text', text: 'OK' });
      });
    }
  });
});
