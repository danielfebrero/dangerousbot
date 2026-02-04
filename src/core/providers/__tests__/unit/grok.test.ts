/**
 * Unit tests for GrokProvider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GrokProvider } from '../../grok.js';
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

function createGrokResponse(content: string | null, opts?: {
  toolCalls?: any[];
  finishReason?: string;
  reasoningContent?: string;
}) {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content,
        reasoning_content: opts?.reasoningContent || null,
        tool_calls: opts?.toolCalls,
      },
      finish_reason: opts?.finishReason || 'stop',
    }],
    usage: { prompt_tokens: 150, completion_tokens: 75, total_tokens: 225 },
  };
}

describe('GrokProvider', () => {
  let provider: GrokProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new GrokProvider({
      apiKey: 'test-grok-key',
      model: 'grok-3-mini',
      maxTokens: 4096,
    });
  });

  describe('constructor', () => {
    it('should set name and model', () => {
      expect(provider.name).toBe('grok');
      expect(provider.model).toBe('grok-3-mini');
    });

    it('should adjust costs for non-reasoning model', () => {
      const p = new GrokProvider({
        apiKey: 'key',
        model: 'grok-3-non-reasoning',
      });
      expect(p.model).toBe('grok-3-non-reasoning');
    });
  });

  describe('supportsTools', () => {
    it('should return true', () => {
      expect(provider.supportsTools()).toBe(true);
    });
  });

  describe('chat', () => {
    it('should call xAI API and return parsed response', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        createGrokResponse('Hello from Grok!')
      ));

      const result = await provider.chat(
        [{ role: 'user', content: 'Hello' }],
        { system: 'You are helpful' }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.x.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-grok-key',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');

      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello from Grok!' });
      expect(result.stopReason).toBe('end_turn');
    });

    it('should include reasoning_content in response', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        createGrokResponse('Final answer', { reasoningContent: 'Let me think step by step...' })
      ));

      const result = await provider.chat(
        [{ role: 'user', content: 'Think about this' }],
        {}
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe('text');
      expect((result.content[0] as any).text).toContain('<reasoning>');
      expect((result.content[0] as any).text).toContain('Let me think step by step');
      expect(result.content[1]).toEqual({ type: 'text', text: 'Final answer' });
    });

    it('should handle tool_calls response', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        createGrokResponse(null, {
          toolCalls: [{
            id: 'call_123',
            type: 'function',
            function: { name: 'shell', arguments: '{"command":"ls"}' },
          }],
          finishReason: 'tool_calls',
        })
      ));

      const result = await provider.chat(
        [{ role: 'user', content: 'List files' }],
        {}
      );

      expect(result.content[0]).toEqual({
        type: 'tool_use',
        id: 'call_123',
        name: 'shell',
        input: { command: 'ls' },
      });
      expect(result.stopReason).toBe('tool_use');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue(createFetchResponse('Server error', false, 500));

      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], {})
      ).rejects.toThrow('Grok API error: 500');
    });

    it('should handle length finish reason', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(
        createGrokResponse('Truncated response', { finishReason: 'length' })
      ));

      const result = await provider.chat(
        [{ role: 'user', content: 'Long question' }],
        {}
      );

      expect(result.stopReason).toBe('max_tokens');
    });
  });

  describe('convertMessages', () => {
    it('should convert assistant messages with tool_use blocks', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createGrokResponse('OK')));

      const messages: AIMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me read that' },
            { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: '/test.ts' } },
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

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      const assistantMsg = body.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.tool_calls[0].function.name).toBe('read_file');

      const toolMsg = body.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg.tool_call_id).toBe('tc1');
      expect(toolMsg.content).toBe('file content');
    });

    it('should handle image blocks as unsupported text', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createGrokResponse('OK')));

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

    it('should skip empty assistant messages', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createGrokResponse('OK')));

      const messages: AIMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: '' }],
        },
        { role: 'user', content: 'Hello' },
      ];

      await provider.chat(messages, {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Empty assistant message should be skipped
      expect(body.messages.filter((m: any) => m.role === 'assistant')).toHaveLength(0);
    });
  });

  describe('convertTools', () => {
    it('should return undefined for empty tools', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createGrokResponse('OK')));

      await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        { tools: [] }
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tools).toBeUndefined();
    });

    it('should convert tools with tool_choice auto', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createGrokResponse('OK')));

      const tools: AIToolDefinition[] = [{
        name: 'shell',
        description: 'Run a shell command',
        input_schema: { type: 'object', properties: { command: { type: 'string' } } },
      }];

      await provider.chat(
        [{ role: 'user', content: 'Run ls' }],
        { tools }
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tool_choice).toBe('auto');
      expect(body.tools[0].type).toBe('function');
      expect(body.tools[0].function.name).toBe('shell');
    });
  });

  describe('cost calculation', () => {
    it('should use Grok pricing ($3/M input, $15/M output)', async () => {
      mockFetch.mockResolvedValue(createFetchResponse(createGrokResponse('OK')));

      const result = await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        {}
      );

      expect(result.cost).toBeDefined();
      // 150 input, 75 output
      expect(result.cost!.input_cost).toBeCloseTo(0.00045);
      expect(result.cost!.output_cost).toBeCloseTo(0.001125);
    });
  });
});
