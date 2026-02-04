import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const { mockSetActiveProvider, mockSetThreadProvider, mockGetThreadManager } = vi.hoisted(() => {
  const mockSetThreadProvider = vi.fn();
  return {
    mockSetActiveProvider: vi.fn(),
    mockSetThreadProvider,
    mockGetThreadManager: vi.fn(() => ({
      setThreadProvider: mockSetThreadProvider,
    })),
  };
});

vi.mock('../../../../config.js', () => ({
  setActiveProvider: mockSetActiveProvider,
}));

vi.mock('../../../thread-manager.js', () => ({
  getThreadManager: mockGetThreadManager,
}));

import { switchProviderHandler, switchProviderDefinition } from '../../switch-provider.js';

describe('switch_provider tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).__pendingProviderSwitch;
    ctx = createMockToolContext({ threadId: undefined });
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(switchProviderHandler.name).toBe('switch_provider');
    });

    it('should expose the definition', () => {
      expect(switchProviderHandler.definition).toBe(switchProviderDefinition);
    });

    it('should require the provider property', () => {
      expect(switchProviderDefinition.input_schema.required).toContain('provider');
    });

    it('should enumerate valid providers', () => {
      const providerProp = switchProviderDefinition.input_schema.properties.provider as any;
      expect(providerProp.enum).toEqual(['claude', 'kimi', 'mistral', 'grok']);
    });
  });

  describe('invalid provider', () => {
    it('should return an error for an unknown provider', async () => {
      const result = await switchProviderHandler.execute({ provider: 'openai' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Provider inconnu');
      expect(result.error).toContain('openai');
    });

    it('should not call setActiveProvider for an invalid provider', async () => {
      await switchProviderHandler.execute({ provider: 'invalid' }, ctx);

      expect(mockSetActiveProvider).not.toHaveBeenCalled();
      expect(mockGetThreadManager).not.toHaveBeenCalled();
    });

    it('should not set global.__pendingProviderSwitch for an invalid provider', async () => {
      await switchProviderHandler.execute({ provider: 'bad' }, ctx);

      expect((global as any).__pendingProviderSwitch).toBeUndefined();
    });
  });

  describe('thread-scoped switch', () => {
    it('should call getThreadManager().setThreadProvider when threadId is present', async () => {
      ctx = createMockToolContext({ threadId: 'thread-42' });

      await switchProviderHandler.execute({ provider: 'claude' }, ctx);

      expect(mockGetThreadManager).toHaveBeenCalled();
      expect(mockSetThreadProvider).toHaveBeenCalledWith('thread-42', 'claude');
    });

    it('should not call setActiveProvider when threadId is present', async () => {
      ctx = createMockToolContext({ threadId: 'thread-42' });

      await switchProviderHandler.execute({ provider: 'kimi' }, ctx);

      expect(mockSetActiveProvider).not.toHaveBeenCalled();
    });

    it('should return success with the provider name', async () => {
      ctx = createMockToolContext({ threadId: 'thread-42' });

      const result = await switchProviderHandler.execute({ provider: 'mistral' }, ctx);

      expect(result.success).toBe(true);
      expect(result.provider).toBe('mistral');
      expect(result.message).toContain('mistral');
    });

    it('should set global.__pendingProviderSwitch with scope thread', async () => {
      ctx = createMockToolContext({ threadId: 'thread-99' });

      await switchProviderHandler.execute({ provider: 'grok' }, ctx);

      expect((global as any).__pendingProviderSwitch).toEqual({
        provider: 'grok',
        threadId: 'thread-99',
        scope: 'thread',
      });
    });
  });

  describe('global switch', () => {
    it('should call setActiveProvider when no threadId', async () => {
      ctx = createMockToolContext({ threadId: undefined });

      await switchProviderHandler.execute({ provider: 'claude' }, ctx);

      expect(mockSetActiveProvider).toHaveBeenCalledWith('claude');
    });

    it('should not call getThreadManager when no threadId', async () => {
      ctx = createMockToolContext({ threadId: undefined });

      await switchProviderHandler.execute({ provider: 'kimi' }, ctx);

      expect(mockGetThreadManager).not.toHaveBeenCalled();
    });

    it('should return success with the provider name', async () => {
      ctx = createMockToolContext({ threadId: undefined });

      const result = await switchProviderHandler.execute({ provider: 'mistral' }, ctx);

      expect(result.success).toBe(true);
      expect(result.provider).toBe('mistral');
      expect(result.message).toContain('mistral');
    });

    it('should set global.__pendingProviderSwitch with scope global', async () => {
      ctx = createMockToolContext({ threadId: undefined });

      await switchProviderHandler.execute({ provider: 'grok' }, ctx);

      expect((global as any).__pendingProviderSwitch).toEqual({
        provider: 'grok',
        threadId: null,
        scope: 'global',
      });
    });
  });

  describe('all valid providers', () => {
    const providers = ['claude', 'kimi', 'mistral', 'grok'];

    providers.forEach((provider) => {
      it(`should accept '${provider}' as a valid provider (global)`, async () => {
        ctx = createMockToolContext({ threadId: undefined });

        const result = await switchProviderHandler.execute({ provider }, ctx);

        expect(result.success).toBe(true);
        expect(result.provider).toBe(provider);
      });

      it(`should accept '${provider}' as a valid provider (thread)`, async () => {
        ctx = createMockToolContext({ threadId: 'thread-1' });

        const result = await switchProviderHandler.execute({ provider }, ctx);

        expect(result.success).toBe(true);
        expect(result.provider).toBe(provider);
      });
    });
  });
});
