/**
 * Unit tests for ClaudeProvider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK using vi.hoisted for factory access
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}));

import { ClaudeProvider } from '../../claude.js';
import type { AIMessage, AIToolDefinition } from '../../types.js';

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    mockCreate.mockReset();
    provider = new ClaudeProvider({
      apiKey: 'test-api-key',
      model: 'claude-opus-4-5-20251101',
      maxTokens: 4096,
    });
  });

  describe('constructor', () => {
    it('should set name and model', () => {
      expect(provider.name).toBe('claude');
      expect(provider.model).toBe('claude-opus-4-5-20251101');
    });

    it('should create Anthropic client', () => {
      // Anthropic constructor is called internally - we verify the provider works
      expect(provider).toBeDefined();
    });
  });

  describe('supportsTools', () => {
    it('should return true', () => {
      expect(provider.supportsTools()).toBe(true);
    });
  });

  describe('chat', () => {
    it('should call Anthropic API and return parsed response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello back!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await provider.chat(
        [{ role: 'user', content: 'Hello' }],
        { system: 'You are helpful' }
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-opus-4-5-20251101',
          max_tokens: 4096,
          system: 'You are helpful',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
        expect.any(Object)
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello back!' });
      expect(result.stopReason).toBe('end_turn');
      expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
      expect(result.cost).toBeDefined();
      expect(result.cost!.total_cost).toBeGreaterThan(0);
    });

    it('should handle tool_use response', async () => {
      mockCreate.mockResolvedValue({
        content: [
          { type: 'text', text: 'Let me read that file' },
          { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: '/test.ts' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await provider.chat(
        [{ role: 'user', content: 'Read test.ts' }],
        {
          tools: [{
            name: 'read_file',
            description: 'Read a file',
            input_schema: { type: 'object', properties: { path: { type: 'string' } } },
          }],
        }
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[1]).toEqual({
        type: 'tool_use',
        id: 'tc1',
        name: 'read_file',
        input: { path: '/test.ts' },
      });
      expect(result.stopReason).toBe('tool_use');
    });

    it('should convert messages with content blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const messages: AIMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Reading file' },
            { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: '/a.ts' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tc1', content: 'file content' },
          ],
        },
      ];

      await provider.chat(messages, {});

      const callArgs = mockCreate.mock.calls[0][0];
      const sentMessages = callArgs.messages;

      // Assistant message should have text and tool_use blocks
      expect(sentMessages[0].content[0].type).toBe('text');
      expect(sentMessages[0].content[1].type).toBe('tool_use');

      // User message should have tool_result block
      expect(sentMessages[1].content[0].type).toBe('tool_result');
      expect(sentMessages[1].content[0].tool_use_id).toBe('tc1');
    });

    it('should convert image content blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'I see an image' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 20 },
      });

      const messages: AIMessage[] = [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
        ],
      }];

      await provider.chat(messages, {});

      const sentMessages = mockCreate.mock.calls[0][0].messages;
      expect(sentMessages[0].content[1].type).toBe('image');
      expect(sentMessages[0].content[1].source.type).toBe('base64');
      expect(sentMessages[0].content[1].source.data).toBe('abc123');
    });

    it('should handle unknown content block types', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const messages: AIMessage[] = [{
        role: 'user',
        content: [
          { type: 'unknown_type' as any, text: 'something' },
        ],
      }];

      await provider.chat(messages, {});

      const sentMessages = mockCreate.mock.calls[0][0].messages;
      // Unknown types should be converted to empty text
      expect(sentMessages[0].content[0].type).toBe('text');
      expect(sentMessages[0].content[0].text).toBe('');
    });

    it('should pass abort signal to API call', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const controller = new AbortController();
      await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        { abortSignal: controller.signal }
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.any(Object),
        { signal: controller.signal }
      );
    });

    it('should handle API errors', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit'));

      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], {})
      ).rejects.toThrow('API rate limit');
    });
  });

  describe('convertTools', () => {
    it('should return undefined for empty tools', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        { tools: [] }
      );

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toBeUndefined();
    });

    it('should format tools correctly', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const tools: AIToolDefinition[] = [{
        name: 'read_file',
        description: 'Read a file from disk',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      }];

      await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        { tools }
      );

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toEqual([{
        name: 'read_file',
        description: 'Read a file from disk',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      }]);
    });
  });

  describe('cost calculation', () => {
    it('should calculate cost with Claude Opus 4.5 pricing', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1000000, output_tokens: 500000 },
      });

      const result = await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        {}
      );

      // Claude Opus 4.5: $15/M input, $75/M output
      expect(result.cost!.input_cost).toBe(15.00);
      expect(result.cost!.output_cost).toBe(37.50);
      expect(result.cost!.total_cost).toBe(52.50);
    });
  });

  describe('chatStream', () => {
    it('should process streaming response with text events', async () => {
      // Create async iterable for the stream
      const streamEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 100 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of streamEvents) {
            yield event;
          }
        },
      });

      const onChunk = vi.fn();
      const result = await provider.chatStream(
        [{ role: 'user', content: 'Hi' }],
        { onChunk }
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello world' });
      expect(result.stopReason).toBe('end_turn');
    });

    it('should process streaming tool_use events', async () => {
      const streamEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 100 } } },
        { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tc1', name: 'read_file' } },
        { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"path":' } },
        { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '"/test.ts"}' } },
        { type: 'content_block_stop' },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of streamEvents) {
            yield event;
          }
        },
      });

      const onChunk = vi.fn();
      const result = await provider.chatStream(
        [{ role: 'user', content: 'Read file' }],
        { onChunk }
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: 'tool_use',
        id: 'tc1',
        name: 'read_file',
        input: { path: '/test.ts' },
      });
      expect(result.stopReason).toBe('tool_use');
    });
  });
});
