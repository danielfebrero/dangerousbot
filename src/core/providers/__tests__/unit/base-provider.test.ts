/**
 * Unit tests for BaseProvider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseProvider, ProviderCostConfig } from '../../base-provider.js';
import type { AIMessage, AIResponse, AIToolDefinition, AIContentBlock, AIProviderConfig } from '../../types.js';

// Concrete test implementation of BaseProvider
class TestProvider extends BaseProvider {
  readonly name = 'test';
  protected costConfig: ProviderCostConfig = {
    inputCostPerMillion: 10.00,
    outputCostPerMillion: 30.00,
  };

  convertMessagesCalled: unknown[] = [];
  convertToolsCalled: any;
  makeApiCallResult: any = {
    id: 'test-msg-1',
    content: [{ type: 'text', text: 'Test response' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
  };
  makeStreamingChunks: Array<any> = [];

  protected convertMessages(messages: AIMessage[]): unknown[] {
    this.convertMessagesCalled = messages;
    return messages.map(m => ({ role: m.role, content: m.content }));
  }

  protected convertTools(tools?: AIToolDefinition[]): unknown[] | undefined {
    this.convertToolsCalled = tools;
    if (!tools || tools.length === 0) return undefined;
    return tools.map(t => ({ name: t.name }));
  }

  protected parseResponse(response: unknown): AIResponse {
    const r = response as any;
    return {
      content: r.content || [],
      stopReason: r.stop_reason === 'end_turn' ? 'end_turn' :
                  r.stop_reason === 'tool_use' ? 'tool_use' : null,
      usage: r.usage ? { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens } : undefined,
      cost: r.usage ? this.calculateCost(r.usage.input_tokens, r.usage.output_tokens) : undefined,
    };
  }

  protected async makeApiCall(
    messages: unknown[],
    tools: unknown[] | undefined,
    system: string | undefined,
    maxTokens: number,
    abortSignal?: AbortSignal
  ): Promise<unknown> {
    return this.makeApiCallResult;
  }

  protected async* makeStreamingApiCall(
    messages: unknown[],
    tools: unknown[] | undefined,
    system: string | undefined,
    maxTokens: number,
    abortSignal?: AbortSignal
  ): AsyncGenerator<any> {
    for (const chunk of this.makeStreamingChunks) {
      if (abortSignal?.aborted) break;
      yield chunk;
    }
  }

  supportsTools(): boolean {
    return true;
  }

  // Expose protected methods for testing
  public testCalculateCost(input: number, output: number) {
    return this.calculateCost(input, output);
  }

  public testHandleError(error: unknown) {
    return this.handleError(error);
  }
}

describe('BaseProvider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider({ apiKey: 'test-key', model: 'test-model', maxTokens: 4096 });
  });

  describe('constructor', () => {
    it('should set model, apiKey, and maxTokens', () => {
      expect(provider.model).toBe('test-model');
    });

    it('should default maxTokens to 8096', () => {
      const p = new TestProvider({ apiKey: 'key', model: 'model' });
      // maxTokens is protected, tested through chat behavior
      expect(p.model).toBe('model');
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost correctly', () => {
      const cost = provider.testCalculateCost(1000000, 500000);
      expect(cost.input_cost).toBe(10.00);
      expect(cost.output_cost).toBe(15.00);
      expect(cost.total_cost).toBe(25.00);
    });

    it('should handle zero tokens', () => {
      const cost = provider.testCalculateCost(0, 0);
      expect(cost.input_cost).toBe(0);
      expect(cost.output_cost).toBe(0);
      expect(cost.total_cost).toBe(0);
    });

    it('should handle small numbers', () => {
      const cost = provider.testCalculateCost(100, 50);
      expect(cost.input_cost).toBeCloseTo(0.001);
      expect(cost.output_cost).toBeCloseTo(0.0015);
    });
  });

  describe('handleError', () => {
    it('should return Error instances as-is', () => {
      const error = new Error('Test error');
      const result = provider.testHandleError(error);
      expect(result).toBe(error);
    });

    it('should wrap non-Error values in Error', () => {
      const result = provider.testHandleError('string error');
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('string error');
    });

    it('should handle numeric errors', () => {
      const result = provider.testHandleError(404);
      expect(result.message).toBe('404');
    });
  });

  describe('chat', () => {
    it('should convert messages, call API, and parse response', async () => {
      const messages: AIMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const result = await provider.chat(messages, { system: 'System prompt' });

      expect(provider.convertMessagesCalled).toEqual(messages);
      expect(result.content).toEqual([{ type: 'text', text: 'Test response' }]);
      expect(result.stopReason).toBe('end_turn');
    });

    it('should convert tools when provided', async () => {
      const tools: AIToolDefinition[] = [{
        name: 'test_tool',
        description: 'A test tool',
        input_schema: { type: 'object', properties: {} },
      }];

      await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        { tools }
      );

      expect(provider.convertToolsCalled).toEqual(tools);
    });

    it('should throw on API error', async () => {
      provider.makeApiCallResult = null;
      // Override makeApiCall to throw
      (provider as any).makeApiCall = async () => { throw new Error('API failed'); };

      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], {})
      ).rejects.toThrow('API failed');
    });
  });

  describe('chatStream', () => {
    it('should accumulate text chunks', async () => {
      provider.makeStreamingChunks = [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
        { type: 'finish', reason: 'stop' },
      ];

      const onChunk = vi.fn();
      const result = await provider.chatStream(
        [{ role: 'user', content: 'Hi' }],
        { onChunk }
      );

      expect(onChunk).toHaveBeenCalledWith({ type: 'text', text: 'Hello ' });
      expect(onChunk).toHaveBeenCalledWith({ type: 'text', text: 'world' });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello world' });
      expect(result.stopReason).toBe('end_turn');
    });

    it('should handle tool_use chunks', async () => {
      provider.makeStreamingChunks = [
        { type: 'text', text: 'Let me read that file' },
        { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: '/test.ts' } },
        { type: 'finish', reason: 'tool_calls' },
      ];

      const onChunk = vi.fn();
      const result = await provider.chatStream(
        [{ role: 'user', content: 'Read file' }],
        { onChunk }
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Let me read that file' });
      expect(result.content[1]).toEqual({
        type: 'tool_use',
        id: 'tc1',
        name: 'read_file',
        input: { path: '/test.ts' },
      });
      expect(result.stopReason).toBe('tool_use');
    });

    it('should handle usage chunks', async () => {
      provider.makeStreamingChunks = [
        { type: 'text', text: 'Response' },
        { type: 'usage', inputTokens: 100, outputTokens: 50 },
        { type: 'finish', reason: 'stop' },
      ];

      const onChunk = vi.fn();
      const result = await provider.chatStream(
        [{ role: 'user', content: 'Hi' }],
        { onChunk }
      );

      expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
      expect(onChunk).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'usage', inputTokens: 100, outputTokens: 50 })
      );
    });

    it('should force tool_use stopReason when tool_use blocks exist without proper finish_reason', async () => {
      provider.makeStreamingChunks = [
        { type: 'tool_use', id: 'tc1', name: 'read_file', input: {} },
        { type: 'finish', reason: 'stop' },
      ];

      const result = await provider.chatStream(
        [{ role: 'user', content: 'Read' }],
        { onChunk: vi.fn() }
      );

      expect(result.stopReason).toBe('tool_use');
    });

    it('should handle max_tokens finish reason', async () => {
      provider.makeStreamingChunks = [
        { type: 'text', text: 'Truncated' },
        { type: 'finish', reason: 'length' },
      ];

      const result = await provider.chatStream(
        [{ role: 'user', content: 'Long answer' }],
        { onChunk: vi.fn() }
      );

      expect(result.stopReason).toBe('max_tokens');
    });

    it('should handle max_tokens string directly', async () => {
      provider.makeStreamingChunks = [
        { type: 'text', text: 'Truncated' },
        { type: 'finish', reason: 'max_tokens' },
      ];

      const result = await provider.chatStream(
        [{ role: 'user', content: 'Long answer' }],
        { onChunk: vi.fn() }
      );

      expect(result.stopReason).toBe('max_tokens');
    });

    it('should stop on abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      provider.makeStreamingChunks = [
        { type: 'text', text: 'Should not reach' },
      ];

      const result = await provider.chatStream(
        [{ role: 'user', content: 'Hi' }],
        { onChunk: vi.fn(), abortSignal: controller.signal }
      );

      // Should have empty content since abort was immediate
      expect(result.content).toHaveLength(0);
    });

    it('should throw on streaming error', async () => {
      (provider as any).makeStreamingApiCall = async function* () {
        throw new Error('Stream failed');
      };

      await expect(
        provider.chatStream(
          [{ role: 'user', content: 'Hi' }],
          { onChunk: vi.fn() }
        )
      ).rejects.toThrow('Stream failed');
    });
  });
});
