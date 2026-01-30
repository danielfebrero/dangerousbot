/**
 * Mistral Provider - Mistral AI API
 * Implémentation avec BaseProvider
 */

import { BaseProvider } from './base-provider.js';
import { AIMessage, AIResponse, AIToolDefinition, AIContentBlock, AIProviderConfig } from './types.js';

interface MistralMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{type: 'text'; text: string}>;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface MistralResponse {
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class MistralProvider extends BaseProvider {
  readonly name = 'mistral';
  private baseUrl = 'https://api.mistral.ai/v1';

  // Tarifs Mistral (varient selon le modèle)
  protected costConfig = {
    inputCostPerMillion: 2.00,   // Mistral Large: ~$2/M input
    outputCostPerMillion: 6.00   // Mistral Large: ~$6/M output
  };

  constructor(config: AIProviderConfig) {
    super(config);
    // Ajuster les coûts selon le modèle
    if (config.model.includes('small')) {
      this.costConfig = { inputCostPerMillion: 0.20, outputCostPerMillion: 0.60 };
    } else if (config.model.includes('medium')) {
      this.costConfig = { inputCostPerMillion: 0.60, outputCostPerMillion: 1.80 };
    }
  }

  supportsTools(): boolean {
    return true;
  }

  protected convertMessages(messages: AIMessage[]): MistralMessage[] {
    const result: MistralMessage[] = [];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
        continue;
      }

      if (msg.role === 'assistant') {
        let textContent = '';
        const toolCalls: MistralMessage['tool_calls'] = [];

        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            textContent += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id || `call_${Date.now()}`,
              type: 'function',
              function: {
                name: block.name || '',
                arguments: JSON.stringify(block.input || {})
              }
            });
          }
        }

        if (!textContent && toolCalls.length === 0) continue;

        const assistantMsg: MistralMessage = {
          role: 'assistant',
          content: textContent || ''
        };

        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls;
        }

        result.push(assistantMsg);

      } else if (msg.role === 'user') {
        const toolResults: MistralMessage[] = [];
        let textContent = '';

        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            textContent += block.text;
          } else if (block.type === 'image') {
            // Mistral ne supporte pas les images directement dans l'API chat
            // On pourrait implémenter la vision via un autre endpoint
            textContent += '[Image: non supportée dans ce mode]';
          } else if (block.type === 'tool_result') {
            let resultContent = '';
            if (typeof block.content === 'string') {
              resultContent = block.content;
            } else if (Array.isArray(block.content)) {
              resultContent = (block.content as any[])
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('\n');
            }
            toolResults.push({
              role: 'tool',
              content: resultContent || 'OK',
              tool_call_id: block.tool_use_id
            });
          }
        }

        result.push(...toolResults);

        if (textContent) {
          result.push({ role: 'user', content: textContent });
        }
      }
    }

    return result;
  }

  protected convertTools(tools?: AIToolDefinition[]): unknown[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));
  }

  protected async makeApiCall(
    messages: MistralMessage[],
    tools: unknown[] | undefined,
    system: string | undefined,
    maxTokens: number,
    abortSignal?: AbortSignal
  ): Promise<MistralResponse> {
    const allMessages: MistralMessage[] = system
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const body: Record<string, unknown> = {
      model: this.model,
      messages: allMessages,
      max_tokens: maxTokens
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
      signal: abortSignal
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    return await response.json() as MistralResponse;
  }

  protected parseResponse(response: MistralResponse): AIResponse {
    const choice = response.choices[0];
    const message = choice.message;
    const content: AIContentBlock[] = [];

    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments)
        });
      }
    }

    let stopReason: AIResponse['stopReason'] = null;
    if (choice.finish_reason === 'stop') {
      stopReason = 'end_turn';
    } else if (choice.finish_reason === 'tool_calls') {
      stopReason = 'tool_use';
    } else if (choice.finish_reason === 'length') {
      stopReason = 'max_tokens';
    }

    return {
      content,
      stopReason,
      usage: {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens
      },
      cost: this.calculateCost(
        response.usage.prompt_tokens,
        response.usage.completion_tokens
      )
    };
  }

  protected async* makeStreamingApiCall(
    messages: MistralMessage[],
    tools: unknown[] | undefined,
    system: string | undefined,
    maxTokens: number,
    abortSignal?: AbortSignal
  ): AsyncGenerator<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown } | { type: 'usage'; inputTokens: number; outputTokens: number } | { type: 'finish'; reason: string | null }, void, unknown> {
    const allMessages: MistralMessage[] = system
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const body: Record<string, unknown> = {
      model: this.model,
      messages: allMessages,
      max_tokens: maxTokens,
      stream: true
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
      signal: abortSignal
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (abortSignal?.aborted) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;

            if (delta?.content) {
              yield { type: 'text', text: delta.content };
            }

            if (delta?.tool_calls) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index ?? 0;

                if (!pendingToolCalls.has(index)) {
                  pendingToolCalls.set(index, {
                    id: toolCallDelta.id || `call_${Date.now()}_${index}`,
                    name: toolCallDelta.function?.name || '',
                    arguments: toolCallDelta.function?.arguments || ''
                  });
                } else {
                  const pending = pendingToolCalls.get(index)!;
                  if (toolCallDelta.function?.arguments) {
                    pending.arguments += toolCallDelta.function.arguments;
                  }
                }
              }
            }

            if (chunk.usage) {
              yield {
                type: 'usage',
                inputTokens: chunk.usage.prompt_tokens || 0,
                outputTokens: chunk.usage.completion_tokens || 0
              };
            }

            if (chunk.choices?.[0]?.finish_reason) {
              yield { type: 'finish', reason: chunk.choices[0].finish_reason };
            }
          } catch {
            // Ignorer les lignes malformées
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Émettre les tool calls complétés
    for (const [, toolCall] of pendingToolCalls) {
      if (toolCall.name) {
        let parsedInput = {};
        try {
          parsedInput = JSON.parse(toolCall.arguments || '{}');
        } catch {
          console.error('[Mistral] Failed to parse tool arguments:', toolCall.arguments);
        }

        yield {
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: parsedInput
        };
      }
    }
  }
}
