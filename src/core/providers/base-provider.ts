/**
 * BaseProvider - Classe abstraite pour factoriser la logique commune des providers AI
 */

import { AIProvider, AIMessage, AIResponse, AIToolDefinition, AIContentBlock, AIProviderConfig, StreamCallback } from './types.js';

export interface ProviderCostConfig {
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export abstract class BaseProvider implements AIProvider {
  readonly abstract name: string;
  readonly model: string;
  protected maxTokens: number;
  protected apiKey: string;
  protected abstract costConfig: ProviderCostConfig;

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxTokens = config.maxTokens || 8096;
  }

  /**
   * Calcule le coût en fonction des tokens utilisés
   */
  protected calculateCost(inputTokens: number, outputTokens: number): AIResponse['cost'] {
    const inputCost = (inputTokens / 1_000_000) * this.costConfig.inputCostPerMillion;
    const outputCost = (outputTokens / 1_000_000) * this.costConfig.outputCostPerMillion;
    return {
      input_cost: inputCost,
      output_cost: outputCost,
      total_cost: inputCost + outputCost
    };
  }

  /**
   * Gestion standardisée des erreurs
   */
  protected handleError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }

  /**
   * Conversion des messages au format spécifique du provider
   * À implémenter par chaque provider
   */
  protected abstract convertMessages(messages: AIMessage[]): unknown[];

  /**
   * Conversion des tools au format spécifique du provider
   * À implémenter par chaque provider
   */
  protected abstract convertTools(tools?: AIToolDefinition[]): unknown[] | undefined;

  /**
   * Parse la réponse du provider au format unifié
   * À implémenter par chaque provider
   */
  protected abstract parseResponse(response: unknown): AIResponse;

  /**
   * Effectue l'appel API (non-streaming)
   * À implémenter par chaque provider
   */
  protected abstract makeApiCall(
    messages: unknown[],
    tools: unknown[] | undefined,
    system: string | undefined,
    maxTokens: number,
    abortSignal?: AbortSignal
  ): Promise<unknown>;

  /**
   * Effectue l'appel API en streaming
   * À implémenter par chaque provider
   */
  protected abstract makeStreamingApiCall(
    messages: unknown[],
    tools: unknown[] | undefined,
    system: string | undefined,
    maxTokens: number,
    abortSignal?: AbortSignal
  ): AsyncGenerator<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown } | { type: 'usage'; inputTokens: number; outputTokens: number } | { type: 'finish'; reason: string | null }, void, unknown>;

  /**
   * Méthode chat standardisée
   */
  async chat(
    messages: AIMessage[],
    options: {
      system?: string;
      tools?: AIToolDefinition[];
      maxTokens?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<AIResponse> {
    try {
      const convertedMessages = this.convertMessages(messages);
      const convertedTools = this.convertTools(options.tools);
      
      const response = await this.makeApiCall(
        convertedMessages,
        convertedTools,
        options.system,
        options.maxTokens || this.maxTokens,
        options.abortSignal
      );

      return this.parseResponse(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Méthode chatStream standardisée
   */
  async chatStream(
    messages: AIMessage[],
    options: {
      system?: string;
      tools?: AIToolDefinition[];
      maxTokens?: number;
      abortSignal?: AbortSignal;
      onChunk: StreamCallback;
    }
  ): Promise<AIResponse> {
    try {
      const convertedMessages = this.convertMessages(messages);
      const convertedTools = this.convertTools(options.tools);

      const content: AIContentBlock[] = [];
      let currentText = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let finishReason: string | null = null;

      const stream = this.makeStreamingApiCall(
        convertedMessages,
        convertedTools,
        options.system,
        options.maxTokens || this.maxTokens,
        options.abortSignal
      );

      for await (const chunk of stream) {
        if (options.abortSignal?.aborted) {
          break;
        }

        switch (chunk.type) {
          case 'text':
            currentText += chunk.text;
            options.onChunk({ type: 'text', text: chunk.text });
            break;
          
          case 'tool_use':
            // Ajouter le texte accumulé avant le tool_use
            if (currentText) {
              content.push({ type: 'text', text: currentText });
              currentText = '';
            }
            content.push({
              type: 'tool_use',
              id: chunk.id,
              name: chunk.name,
              input: chunk.input
            });
            options.onChunk({
              type: 'tool_use',
              id: chunk.id,
              name: chunk.name,
              input: chunk.input
            });
            break;
          
          case 'usage':
            inputTokens = chunk.inputTokens;
            outputTokens = chunk.outputTokens;
            break;
          
          case 'finish':
            finishReason = chunk.reason;
            break;
        }
      }

      // Ajouter le texte restant
      if (currentText) {
        content.push({ type: 'text', text: currentText });
      }

      // Convertir le stop reason
      let stopReason: AIResponse['stopReason'] = null;
      if (finishReason === 'stop' || finishReason === 'end_turn') {
        stopReason = 'end_turn';
      } else if (finishReason === 'tool_calls' || finishReason === 'tool_use') {
        stopReason = 'tool_use';
      } else if (finishReason === 'length' || finishReason === 'max_tokens') {
        stopReason = 'max_tokens';
      }

      // Fallback: si on a des tool_use blocks mais pas de finish_reason approprié,
      // forcer stopReason à 'tool_use' pour que le serveur les exécute
      const hasToolUse = content.some(block => block.type === 'tool_use');
      if (hasToolUse && stopReason !== 'tool_use') {
        console.warn('[BaseProvider] Detected tool_use blocks without proper finish_reason, forcing stopReason to tool_use');
        stopReason = 'tool_use';
      }

      return {
        content,
        stopReason,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens
        },
        cost: this.calculateCost(inputTokens, outputTokens)
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  abstract supportsTools(): boolean;
}
