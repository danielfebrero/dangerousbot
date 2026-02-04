/**
 * Unit tests for KimiProvider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KimiProvider } from '../../kimi.js';
import type { AIMessage, AIToolDefinition } from '../../types.js';

// Mock global fetch
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

function createKimiResponse(content: string | null, toolCalls?: any[], finishReason = 'stop') {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content,
        tool_calls: toolCalls,
      },
      finish_reason: finishReason,
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

describe('KimiProvider', () => {
  let provider: KimiProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new KimiProvider({
      apiKey: 'test-kimi-key',
      model: 'kimi-k2.5',
      maxTokens: 4096,
    });
  });

  describe('constructor', () => {
    it('should set name and model', () => {
      expect(provider.name).toBe('kimi');
      expect(provider.model).toBe('kimi-k2.5');
    });
  });

  describe('supportsTools', () => {
    it('should return true', () => {
      expect(provider.supportsTools()).toBe(true);
    });
  });

  describe('chat', () => {
    it('should call Kimi API and return parsed response', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        createKimiResponse('Hello back!')
      ));

      const result = await provider.chat(
        [{ role: 'user', content: 'Hello' }],
        { system: 'You are helpful' }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.moonshot.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-kimi-key',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('kimi-k2.5');
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello back!' });
      expect(result.stopReason).toBe('end_turn');
      expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
    });

    it('should handle tool_calls response', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        createKimiResponse(null, [{
          id: 'tc1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"/test.ts"}' },
        }], 'tool_calls')
      ));

      const result = await provider.chat(
        [{ role: 'user', content: 'Read test.ts' }],
        {}
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

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        'Insufficient balance', false, 403
      ));

      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], {})
      ).rejects.toThrow('Kimi API error: 403');
    });

    it('should handle length finish reason', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        createKimiResponse('Truncated', undefined, 'length')
      ));

      const result = await provider.chat(
        [{ role: 'user', content: 'Long request' }],
        {}
      );

      expect(result.stopReason).toBe('max_tokens');
    });
  });

  describe('convertMessages', () => {
    it('should convert string messages', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createKimiResponse('OK')));

      await provider.chat(
        [{ role: 'user', content: 'Hello' }],
        {}
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should convert assistant messages with tool_use blocks', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createKimiResponse('OK')));

      const messages: AIMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Reading file' },
            { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: '/test.ts' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tc1', content: 'file content here' },
          ],
        },
      ];

      await provider.chat(messages, {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Assistant should have tool_calls
      const assistantMsg = body.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.tool_calls).toBeDefined();
      expect(assistantMsg.tool_calls[0].function.name).toBe('read_file');

      // Tool result should be role: 'tool'
      const toolMsg = body.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg.tool_call_id).toBe('tc1');
      expect(toolMsg.content).toBe('file content here');
    });

    it('should convert image content to image_url format', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createKimiResponse('OK')));

      const messages: AIMessage[] = [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
        ],
      }];

      await provider.chat(messages, {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMsg = body.messages[0];
      expect(userMsg.content).toHaveLength(2);
      expect(userMsg.content[1].type).toBe('image_url');
      expect(userMsg.content[1].image_url.url).toContain('data:image/png;base64,abc123');
    });

    it('should skip orphaned tool_results', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createKimiResponse('OK')));

      const messages: AIMessage[] = [{
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'nonexistent', content: 'orphan result' },
        ],
      }];

      await provider.chat(messages, {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Orphaned tool result should be skipped
      const toolMsg = body.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg).toBeUndefined();
    });

    it('should handle null/undefined content', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createKimiResponse('OK')));

      const messages: AIMessage[] = [{
        role: 'user',
        content: null as any,
      }];

      await provider.chat(messages, {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toBe('');
    });
  });

  describe('convertTools', () => {
    it('should convert web_search to builtin_function', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createKimiResponse('OK')));

      const tools: AIToolDefinition[] = [{
        name: 'web_search',
        description: 'Search the web',
        input_schema: { type: 'object', properties: { query: { type: 'string' } } },
      }];

      await provider.chat(
        [{ role: 'user', content: 'Search' }],
        { tools }
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tools[0]).toEqual({
        type: 'builtin_function',
        function: { name: '$web_search' },
      });
    });

    it('should convert regular tools to function format', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createKimiResponse('OK')));

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
    });
  });

  describe('cost calculation', () => {
    it('should use Kimi pricing ($0.60/M input, $3.00/M output)', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        createKimiResponse('OK')
      ));

      const result = await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        {}
      );

      expect(result.cost).toBeDefined();
      // 100 input tokens, 50 output tokens
      expect(result.cost!.input_cost).toBeCloseTo(0.00006);
      expect(result.cost!.output_cost).toBeCloseTo(0.00015);
    });
  });
});
