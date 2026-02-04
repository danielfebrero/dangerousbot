/**
 * Contract tests for AIProvider interface
 *
 * Verifies that all provider implementations correctly implement
 * the AIProvider interface, including:
 * - Required properties (name, model)
 * - Required methods (chat, chatStream, supportsTools)
 * - Consistent response format
 * - Consistent error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIProvider, AIMessage, AIResponse, AIToolDefinition } from '../../types.js';
import { ClaudeProvider } from '../../claude.js';
import { KimiProvider } from '../../kimi.js';
import { MistralProvider } from '../../mistral.js';
import { GrokProvider } from '../../grok.js';
import { createProvider } from '../../index.js';

// Mock Anthropic SDK for Claude
const { mockClaudeCreate } = vi.hoisted(() => ({
  mockClaudeCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockClaudeCreate },
  })),
}));

// Mock global fetch for Kimi, Mistral, Grok
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Standard test fixtures
const testMessages: AIMessage[] = [
  { role: 'user', content: 'Hello, how are you?' },
];

const testTools: AIToolDefinition[] = [{
  name: 'read_file',
  description: 'Read a file',
  input_schema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
}];

// Standard API response helpers
function createClaudeApiResponse() {
  return {
    content: [{ type: 'text', text: 'Claude response' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function createOpenAIStyleResponse(name: string) {
  return {
    choices: [{
      message: { role: 'assistant', content: `${name} response` },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

describe('AIProvider Contract', () => {
  const providerConfigs: Array<{
    name: string;
    factory: () => AIProvider;
    setupMock: () => void;
  }> = [
    {
      name: 'Claude',
      factory: () => new ClaudeProvider({ apiKey: 'test-key', model: 'claude-opus-4-5', maxTokens: 4096 }),
      setupMock: () => {
        mockClaudeCreate.mockResolvedValue(createClaudeApiResponse());
      },
    },
    {
      name: 'Kimi',
      factory: () => new KimiProvider({ apiKey: 'test-key', model: 'kimi-k2.5', maxTokens: 4096 }),
      setupMock: () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(createOpenAIStyleResponse('Kimi')),
          text: vi.fn().mockResolvedValue(''),
        });
      },
    },
    {
      name: 'Mistral',
      factory: () => new MistralProvider({ apiKey: 'test-key', model: 'mistral-large', maxTokens: 4096 }),
      setupMock: () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(createOpenAIStyleResponse('Mistral')),
          text: vi.fn().mockResolvedValue(''),
        });
      },
    },
    {
      name: 'Grok',
      factory: () => new GrokProvider({ apiKey: 'test-key', model: 'grok-3-mini', maxTokens: 4096 }),
      setupMock: () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(createOpenAIStyleResponse('Grok')),
          text: vi.fn().mockResolvedValue(''),
        });
      },
    },
  ];

  describe.each(providerConfigs)('$name provider', ({ name, factory, setupMock }) => {
    let provider: AIProvider;

    beforeEach(() => {
      mockClaudeCreate.mockReset();
      mockFetch.mockReset();
      setupMock();
      provider = factory();
    });

    // --- Property contract ---

    it('should have a non-empty name property', () => {
      expect(typeof provider.name).toBe('string');
      expect(provider.name.length).toBeGreaterThan(0);
    });

    it('should have a non-empty model property', () => {
      expect(typeof provider.model).toBe('string');
      expect(provider.model.length).toBeGreaterThan(0);
    });

    // --- Method existence contract ---

    it('should implement chat method', () => {
      expect(typeof provider.chat).toBe('function');
    });

    it('should implement chatStream method', () => {
      expect(typeof provider.chatStream).toBe('function');
    });

    it('should implement supportsTools method', () => {
      expect(typeof provider.supportsTools).toBe('function');
    });

    // --- supportsTools contract ---

    it('supportsTools should return a boolean', () => {
      const result = provider.supportsTools();
      expect(typeof result).toBe('boolean');
    });

    // --- chat response contract ---

    it('chat should return a valid AIResponse', async () => {
      const result = await provider.chat(testMessages, {});

      // content must be an array
      expect(Array.isArray(result.content)).toBe(true);

      // Each content block must have a type
      for (const block of result.content) {
        expect(typeof block.type).toBe('string');
        expect(['text', 'tool_use', 'tool_result', 'image']).toContain(block.type);
      }

      // stopReason must be one of the valid values or null
      const validStopReasons = ['end_turn', 'tool_use', 'max_tokens', 'stop_sequence', null];
      expect(validStopReasons).toContain(result.stopReason);
    });

    it('chat should include usage information', async () => {
      const result = await provider.chat(testMessages, {});

      if (result.usage) {
        expect(typeof result.usage.input_tokens).toBe('number');
        expect(typeof result.usage.output_tokens).toBe('number');
        expect(result.usage.input_tokens).toBeGreaterThanOrEqual(0);
        expect(result.usage.output_tokens).toBeGreaterThanOrEqual(0);
      }
    });

    it('chat should include cost information', async () => {
      const result = await provider.chat(testMessages, {});

      if (result.cost) {
        expect(typeof result.cost.input_cost).toBe('number');
        expect(typeof result.cost.output_cost).toBe('number');
        expect(typeof result.cost.total_cost).toBe('number');
        expect(result.cost.input_cost).toBeGreaterThanOrEqual(0);
        expect(result.cost.output_cost).toBeGreaterThanOrEqual(0);
        expect(result.cost.total_cost).toBeCloseTo(result.cost.input_cost + result.cost.output_cost);
      }
    });

    it('chat should accept optional system prompt', async () => {
      const result = await provider.chat(testMessages, { system: 'You are a helpful assistant' });
      expect(result.content).toBeDefined();
    });

    it('chat should accept optional tools', async () => {
      const result = await provider.chat(testMessages, { tools: testTools });
      expect(result.content).toBeDefined();
    });

    it('chat should accept optional maxTokens', async () => {
      const result = await provider.chat(testMessages, { maxTokens: 1000 });
      expect(result.content).toBeDefined();
    });

    it('chat should accept optional abortSignal', async () => {
      const controller = new AbortController();
      const result = await provider.chat(testMessages, { abortSignal: controller.signal });
      expect(result.content).toBeDefined();
    });
  });

  // --- Factory contract ---

  describe('createProvider factory', () => {
    beforeEach(() => {
      mockClaudeCreate.mockReset();
      mockFetch.mockReset();
    });

    it('should create Claude provider', () => {
      const p = createProvider({ provider: 'claude', apiKey: 'key', model: 'claude-3', maxTokens: 4096 });
      expect(p.name).toBe('claude');
    });

    it('should create Kimi provider', () => {
      const p = createProvider({ provider: 'kimi', apiKey: 'key', model: 'kimi-k2.5', maxTokens: 4096 });
      expect(p.name).toBe('kimi');
    });

    it('should create Mistral provider', () => {
      const p = createProvider({ provider: 'mistral', apiKey: 'key', model: 'mistral-large', maxTokens: 4096 });
      expect(p.name).toBe('mistral');
    });

    it('should create Grok provider', () => {
      const p = createProvider({ provider: 'grok', apiKey: 'key', model: 'grok-3-mini', maxTokens: 4096 });
      expect(p.name).toBe('grok');
    });

    it('should throw for unknown provider', () => {
      expect(() => createProvider({
        provider: 'unknown' as any,
        apiKey: 'key',
        model: 'model',
      })).toThrow('Unknown provider');
    });
  });
});
