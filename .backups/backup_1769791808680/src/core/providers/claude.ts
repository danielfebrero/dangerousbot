/**
 * Claude Provider - Anthropic API
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIMessage, AIResponse, AIToolDefinition, AIContentBlock, AIProviderConfig } from './types.js';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  readonly model: string;
  private client: Anthropic;
  private maxTokens: number;

  constructor(config: AIProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
    this.maxTokens = config.maxTokens || 8096;
  }

  supportsTools(): boolean {
    return true;
  }

  async chat(
    messages: AIMessage[],
    options: {
      system?: string;
      tools?: AIToolDefinition[];
      maxTokens?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<AIResponse> {
    // Convertir les messages au format Anthropic
    const anthropicMessages = this.convertMessages(messages);
    
    // Convertir les tools au format Anthropic
    const anthropicTools = options.tools?.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    })) as Anthropic.Tool[] | undefined;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || this.maxTokens,
      system: options.system,
      tools: anthropicTools,
      messages: anthropicMessages,
      signal: options.abortSignal
    });

    // Convertir la réponse au format unifié
    return this.convertResponse(response);
  }

  private convertMessages(messages: AIMessage[]): Anthropic.MessageParam[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content
        };
      }
      
      // Convertir les content blocks
      const content = msg.content.map(block => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text || '' };
        }
        if (block.type === 'image' && block.source) {
          // Format Anthropic pour les images
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: block.source.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: block.source.data
            }
          };
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id || '',
            name: block.name || '',
            input: block.input || {}
          };
        }
        if (block.type === 'tool_result') {
          return {
            type: 'tool_result' as const,
            tool_use_id: block.tool_use_id || '',
            content: block.content || ''
          };
        }
        return { type: 'text' as const, text: '' };
      });

      return { role: msg.role, content };
    });
  }

  private convertResponse(response: Anthropic.Message): AIResponse {
    const content: AIContentBlock[] = response.content.map(block => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text };
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          id: block.id,
          name: block.name,
          input: block.input
        };
      }
      return { type: 'text' as const, text: '' };
    });

    // Claude retourne le coût total dans usage.total_cost_usd (si disponible)
    // Sinon on calcule avec les tarifs Claude Opus 4.5: $15/M input, $75/M output
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    
    // @ts-ignore - total_cost_usd peut être présent dans certaines versions de l'API
    const totalCostUsd = (response.usage as any).total_cost_usd;
    
    let cost;
    if (totalCostUsd !== undefined) {
      // Le coût total est fourni par l'API
      cost = {
        input_cost: 0, // Pas détaillé par l'API
        output_cost: 0, // Pas détaillé par l'API
        total_cost: totalCostUsd
      };
    } else {
      // Calcul manuel avec les tarifs Claude Opus 4.5
      const inputCost = (inputTokens / 1_000_000) * 15.00;
      const outputCost = (outputTokens / 1_000_000) * 75.00;
      cost = {
        input_cost: inputCost,
        output_cost: outputCost,
        total_cost: inputCost + outputCost
      };
    }

    return {
      content,
      stopReason: response.stop_reason as AIResponse['stopReason'],
      usage: response.usage,
      cost
    };
  }
}
