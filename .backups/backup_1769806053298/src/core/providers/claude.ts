//**
 * Claude Provider - Anthropic API
 * Implémentation avec BaseProvider
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base-provider.js';
import { AIMessage, AIResponse, AIToolDefinition, AIContentBlock, AIProviderConfig } from './types.js';

export class ClaudeProvider extends BaseProvider {
  readonly name = 'claude';
  private client: Anthropic;
  
  protected costConfig = {
    inputCostPerMillion: 15.00,   // Claude Opus 4.5: $15/M input
    outputCostPerMillion: 75.00   // Claude Opus 4.5: $75/M output
  };

  constructor(config: AIProviderConfig) {
    super(config);
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  supportsTools(): boolean {
    return true;
  }

  protected convertMessages(messages: AIMessage[]): Anthropic.MessageParam[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }

      const content = msg.content.map(block => {
        switch (block.type) {
          case 'text':
            return { type: 'text' as const, text: block.text || '' };
          
          case 'image':
            return {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: block.source.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: block.source.data
              }
            };
          
          case 'tool_use':
            return {
              type: 'tool_use' as const,
              id: block.id || '',
              name: block.name || '',
              input: block.input || {}
            };
          
          case 'tool_result':
            return {
              type: 'tool_result' as const,
              tool_use_id: block.tool_use_id || '',
              content: block.content || ''
            };
          
          default:
            return { type: 'text' as const, text: '' };
        }
      });

      return { role: msg.role, content };
    });
  }

  protected convertTools(tools?: AIToolDefinition[]): Anthropic.Tool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    }));
  }

  protected async makeApiCall(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[] | undefined,
    system: string | undefined,
    maxTokens: number,
    abortSignal?: AbortSignal
  ): Promise<Anthropic.Message> {
    return await this.client.messages.create(
      {
        model: this.model,
        max_tokens: maxTokens,
        system,
        tools,
        messages
      },
      { signal: abortSignal }
    );
  }

  protected parseResponse(response: Anthropic.Message): AIResponse {
    const content: AIContentBlock[] = response.content.map(block => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input
        };
      }
      return { type: 'text', text: '' };
    });

    return {
      content,
      stopReason: response.stop_reason as AIResponse['stopReason'],
      usage: response.usage,
      cost: this.calculateCost(
        response.usage.input_tokens,
        response.usage.output_tokens
      )
    };
  }

  protected async* makeStreamingApiCall(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[] | undefined,
    system: string | undefined,
    maxTokens: number,
    abortSignal?: AbortSignal
  ): AsyncGenerator<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown } | { type: 'usage'; inputTokens: number; outputTokens: number } | { type: 'finish'; reason: string | null }, void, unknown> {
    const stream = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: maxTokens,
        system,
        tools,
        messages,
        stream: true
      },
      { signal: abortSignal }
    );

    let currentToolUse: { id: string; name: string; input: string } | null = null;

    for await (const event of stream) {
      if (abortSignal?.aborted) break;

      switch (event.type) {
        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: ''
            };
          }
          break;

        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.input += event.delta.partial_json;
          }
          break;

        case 'content_block_stop':
          if (currentToolUse) {
            yield {
              type: 'tool_use',
              id: currentToolUse.id,
              name: currentToolUse.name,
              input: JSON.parse(currentToolUse.input || '{}')
            };
            currentToolUse = null;
          }
          break;

        case 'message_start':
          yield {
            type: 'usage',
            inputTokens: event.message.usage?.input_tokens || 0,
            outputTokens: 0
          };
          break;

        case 'message_delta':
          if ((event as any).delta?.stop_reason) {
            yield { type: 'finish', reason: (event as any).delta.stop_reason };
          }
          break;
      }
    }
  }
}
