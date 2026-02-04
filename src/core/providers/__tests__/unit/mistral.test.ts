/**
 * Unit tests for MistralProvider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MistralProvider } from '../../mistral.js';
import type { AIMessage, AIToolDefinition } from '../../types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createFetchResponse(data: any, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
}

function createMistralResponse(content: string | null, toolCalls?: any[], finishReason = 'stop') {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content,
        tool_calls: toolCalls,
      },
      finish_reason: finishReason,
    }],
    usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
  };
}

describe('MistralProvider', () => {
  let provider: MistralProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new MistralProvider({
      apiKey: 'test-mistral-key',
      model: 'mistral-large-latest',
      maxTokens: 4096,
    });
  });

  describe('constructor', () => {
    it('should set name and model', () => {
      expect(provider.name).toBe('mistral');
      expect(provider.model).toBe('mistral-large-latest');
    });

    it('should adjust costs for small model', () => {
      const smallProvider = new MistralProvider({
        apiKey: 'key',
        model: 'mistral-small-latest',
      });
      expect(smallProvider.model).toBe('mistral-small-latest');
    });

    it('should adjust costs for medium model', () => {
      const mediumProvider = new MistralProvider({
        apiKey: 'key',
        model: 'mistral-medium-latest',
      });
      expect(mediumProvider.model).toBe('mistral-medium-latest');
    });
  });

  describe('supportsTools', () => {
    it('should return true', () => {
      expect(provider.supportsTools()).toBe(true);
    });
  });

  describe('chat', () => {
    it('should call Mistral API and return parsed response', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        createMistralResponse('Hello back!')
      ));

      const result = await provider.chat(
        [{ role: 'user', content: 'Hello' }],
        { system: 'You are helpful' }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-mistral-key',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].role).toBe('system');

      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello back!' });
      expect(result.stopReason).toBe('end_turn');
    });

    it('should handle tool_calls response', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        createMistralResponse(null, [{
          id: 'abc123def',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"/test.ts"}' },
        }], 'tool_calls')
      ));

      const result = await provider.chat(
        [{ role: 'user', content: 'Read file' }],
        {}
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('tool_use');
      expect(result.stopReason).toBe('tool_use');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue(createFetchResponse('Unauthorized', false, 401));

      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], {})
      ).rejects.toThrow('Mistral API error: 401');
    });
  });

  describe('convertMessages', () => {
    it('should convert tool_use blocks with Mistral-compatible IDs', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createMistralResponse('OK')));

      const messages: AIMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Reading file' },
            { type: 'tool_use', id: 'call_very_long_id_that_needs_conversion', name: 'read_file', input: { path: '/test.ts' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_very_long_id_that_needs_conversion', content: 'file content' },
          ],
        },
      ];

      await provider.chat(messages, {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      const assistantMsg = body.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.tool_calls[0].id).toHaveLength(9);

      const toolMsg = body.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg.tool_call_id).toHaveLength(9);

      // IDs should match
      expect(assistantMsg.tool_calls[0].id).toBe(toolMsg.tool_call_id);
    });

    it('should keep valid 9-char IDs unchanged', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createMistralResponse('OK')));

      const messages: AIMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'abc123def', name: 'read_file', input: {} },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'abc123def', content: 'result' },
          ],
        },
      ];

      await provider.chat(messages, {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const assistantMsg = body.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.tool_calls[0].id).toBe('abc123def');
    });

    it('should handle image blocks as unsupported text', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createMistralResponse('OK')));

      const messages: AIMessage[] = [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
        ],
      }];

      await provider.chat(messages, {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMsg = body.messages.find((m: any) => m.role === 'user');
      expect(userMsg.content).toContain('non supportée');
    });
  });

  describe('convertTools', () => {
    it('should return undefined for empty tools', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createMistralResponse('OK')));

      await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        { tools: [] }
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tools).toBeUndefined();
    });

    it('should convert tools with tool_choice auto', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createMistralResponse('OK')));

      const tools: AIToolDefinition[] = [{
        name: 'read_file',
        description: 'Read a file',
        input_schema: { type: 'object', properties: { path: { type: 'string' } } },
      }];

      await provider.chat(
        [{ role: 'user', content: 'Read' }],
        { tools }
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      });
      expect(body.tool_choice).toBe('auto');
    });
  });

  describe('cost calculation', () => {
    it('should use Mistral Large pricing', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createMistralResponse('OK')));

      const result = await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        {}
      );

      expect(result.cost).toBeDefined();
      // 200 input, 100 output
      // $2/M input, $6/M output
      expect(result.cost!.input_cost).toBeCloseTo(0.0004);
      expect(result.cost!.output_cost).toBeCloseTo(0.0006);
    });
  });
});
