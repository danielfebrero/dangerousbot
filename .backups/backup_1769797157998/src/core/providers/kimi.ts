/**
 * Kimi Provider - Moonshot AI (Kimi 2.5)
 * Compatible avec le format OpenAI
 */

import { AIProvider, AIMessage, AIResponse, AIToolDefinition, AIContentBlock, AIProviderConfig, StreamCallback } from './types.js';

interface KimiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{type: 'text'; text: string} | {type: 'image_url'; image_url: {url: string}}> | null;
  reasoning_content?: string | null;  // Required when tool_calls are present and thinking is enabled
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface KimiChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      reasoning_content?: string | null;  // Kimi k2.5 retourne le raisonnement séparément
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

export class KimiProvider implements AIProvider {
  readonly name = 'kimi';
  readonly model: string;
  private apiKey: string;
  private maxTokens: number;
  private baseUrl = 'https://api.moonshot.ai/v1';
  
  // Note: Kimi k2.5 retourne reasoning_content séparément du content

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxTokens = config.maxTokens || 8096;
  }

  supportsTools(): boolean {
    return true; // Kimi 2.5 supporte les function calls
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
    // Construire les messages au format Kimi/OpenAI
    const kimiMessages: KimiChatMessage[] = [];
    
    // Ajouter le system message
    if (options.system) {
      kimiMessages.push({ role: 'system', content: options.system });
    }
    
    // Convertir les messages
    for (const msg of messages) {
      kimiMessages.push(...this.convertMessage(msg));
    }

    // Construire le body de la requête
    const body: Record<string, unknown> = {
      model: this.model,
      messages: kimiMessages,
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: 1.0  // Kimi k2.5 n'accepte que temperature=1
    };

    // Ajouter les tools si présents
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(tool => {
        // Cas spécial: web_search devient builtin_function $web_search
        if (tool.name === 'web_search') {
          return {
            type: 'builtin_function',
            function: {
              name: '$web_search'
            }
          };
        }
        // Outil standard
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
          }
        };
      });
    }

    // Appeler l'API
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
      signal: options.abortSignal
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kimi API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as KimiChatResponse;
    return this.convertResponse(data);
  }

  private convertMessage(msg: AIMessage): KimiChatMessage[] {
    const result: KimiChatMessage[] = [];
    
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
    } else {
      // Format OpenAI/Kimi: 
      // - Un message assistant peut avoir du texte ET des tool_calls
      // - Les tool_results sont des messages séparés de role 'tool'
      // - Les images sont supportées dans les messages user
      
      // Collecter le texte et les tool_calls pour les messages assistant
      if (msg.role === 'assistant') {
        let textContent = '';
        const toolCalls: Array<{id: string; type: 'function'; function: {name: string; arguments: string}}> = [];

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

        // Ne pas ajouter de message assistant vide (ni texte, ni tool_calls)
        if (!textContent && toolCalls.length === 0) {
          return result; // Skip empty assistant message
        }

        // Créer le message assistant avec texte et/ou tool_calls
        const assistantMsg: KimiChatMessage = {
          role: 'assistant',
          content: textContent || null
        };

        // When tool_calls are present, Kimi requires reasoning_content
        if (toolCalls.length > 0) {
          // Use the text content as reasoning, or provide a placeholder
          assistantMsg.reasoning_content = textContent || 'Processing...';
          assistantMsg.content = null;  // Clear content when we have tool_calls and reasoning
          assistantMsg.tool_calls = toolCalls;
        }

        result.push(assistantMsg);
        
      } else if (msg.role === 'user') {
        // Pour les messages user, extraire les tool_results, le texte et les images
        const toolResults: KimiChatMessage[] = [];
        const contentParts: Array<{type: 'text'; text: string} | {type: 'image_url'; image_url: {url: string}}> = [];
        
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            contentParts.push({ type: 'text', text: block.text });
          } else if (block.type === 'image' && block.source) {
            // Format OpenAI pour les images: image_url avec data URL
            const dataUrl = `data:${block.source.media_type};base64,${block.source.data}`;
            contentParts.push({ 
              type: 'image_url', 
              image_url: { url: dataUrl }
            });
          } else if (block.type === 'tool_result') {
            // Tool result devient un message 'tool' séparé
            let resultContent = '';
            if (typeof block.content === 'string') {
              resultContent = block.content;
            } else if (Array.isArray(block.content)) {
              // Extraire le texte des content blocks
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
        
        // D'abord les tool results (ils répondent au message assistant précédent)
        result.push(...toolResults);
        
        // Puis le message user avec contenu (texte + images)
        if (contentParts.length > 0) {
          if (contentParts.length === 1 && contentParts[0].type === 'text') {
            // Message texte simple
            result.push({ role: 'user', content: contentParts[0].text });
          } else {
            // Message avec images - utiliser le format array de contenu OpenAI
            result.push({ 
              role: 'user', 
              content: contentParts 
            });
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Streaming pour Kimi
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
    const kimiMessages: KimiChatMessage[] = [];
    
    if (options.system) {
      kimiMessages.push({ role: 'system', content: options.system });
    }
    
    for (const msg of messages) {
      kimiMessages.push(...this.convertMessage(msg));
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: kimiMessages,
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: 1.0,
      stream: true,
      stream_options: { include_usage: true }  // Nécessaire pour recevoir les tokens dans le streaming
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(tool => {
        if (tool.name === 'web_search') {
          return {
            type: 'builtin_function',
            function: { name: '$web_search' }
          };
        }
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
          }
        };
      });
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
      signal: options.abortSignal
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kimi API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const content: AIContentBlock[] = [];
    let currentText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: string | null = null;

    // Track tool calls being built (OpenAI streaming sends them in fragments)
    const pendingToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (options.abortSignal?.aborted) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const chunk = JSON.parse(data);
              const delta = chunk.choices?.[0]?.delta;

              if (delta?.content) {
                currentText += delta.content;
                options.onChunk({ type: 'text', text: delta.content });
              }

              // OpenAI-style streaming: tool_calls come in fragments
              // First chunk has index, id, function.name
              // Subsequent chunks have index and function.arguments (partial)
              if (delta?.tool_calls) {
                for (const toolCallDelta of delta.tool_calls) {
                  const index = toolCallDelta.index ?? 0;

                  if (!pendingToolCalls.has(index)) {
                    // First chunk for this tool call - has id and name
                    pendingToolCalls.set(index, {
                      id: toolCallDelta.id || `call_${Date.now()}_${index}`,
                      name: toolCallDelta.function?.name || '',
                      arguments: toolCallDelta.function?.arguments || ''
                    });
                  } else {
                    // Subsequent chunk - accumulate arguments
                    const pending = pendingToolCalls.get(index)!;
                    if (toolCallDelta.function?.arguments) {
                      pending.arguments += toolCallDelta.function.arguments;
                    }
                  }
                }
              }

              if (chunk.usage) {
                inputTokens = chunk.usage.prompt_tokens || inputTokens;
                outputTokens = chunk.usage.completion_tokens || outputTokens;
              }

              if (chunk.choices?.[0]?.finish_reason) {
                finishReason = chunk.choices[0].finish_reason;
              }
            } catch (e) {
              // Ignorer les lignes malformées
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Add text content if any
    if (currentText) {
      content.push({ type: 'text', text: currentText });
    }

    // Process completed tool calls and add to content
    for (const [, toolCall] of pendingToolCalls) {
      if (toolCall.name) {
        let parsedInput = {};
        try {
          parsedInput = JSON.parse(toolCall.arguments || '{}');
        } catch (e) {
          console.error('[Kimi] Failed to parse tool arguments:', toolCall.arguments);
        }

        const toolUseBlock: AIContentBlock = {
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: parsedInput
        };

        content.push(toolUseBlock);

        // Also notify via callback
        options.onChunk({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: parsedInput
        });
      }
    }

    // Convertir le finish_reason
    let stopReason: AIResponse['stopReason'] = null;
    if (finishReason === 'stop') {
      stopReason = 'end_turn';
    } else if (finishReason === 'tool_calls') {
      stopReason = 'tool_use';
    } else if (finishReason === 'length') {
      stopReason = 'max_tokens';
    }

    // Calculer le coût
    const inputCost = (inputTokens / 1_000_000) * 0.60;
    const outputCost = (outputTokens / 1_000_000) * 3.00;

    return {
      content,
      stopReason,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens
      },
      cost: {
        input_cost: inputCost,
        output_cost: outputCost,
        total_cost: inputCost + outputCost
      }
    };
  }

  private convertResponse(response: KimiChatResponse): AIResponse {
    const choice = response.choices[0];
    const message = choice.message;
    const content: AIContentBlock[] = [];

    // Kimi k2.5 peut retourner reasoning_content + content
    // On combine les deux si présents
    let textContent = '';
    
    // Le reasoning est optionnel, on peut l'afficher ou non
    // Pour l'instant on l'ignore et on garde juste le content final
    if (message.content) {
      textContent = message.content;
    } else if (message.reasoning_content && !message.content) {
      // Si seulement reasoning_content (cas de finish_reason: length)
      textContent = message.reasoning_content;
    }
    
    if (textContent) {
      content.push({ type: 'text', text: textContent });
    }

    // Ajouter les tool calls si présents
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

    // Convertir le finish_reason
    let stopReason: AIResponse['stopReason'] = null;
    if (choice.finish_reason === 'stop') {
      stopReason = 'end_turn';
    } else if (choice.finish_reason === 'tool_calls') {
      stopReason = 'tool_use';
    } else if (choice.finish_reason === 'length') {
      stopReason = 'max_tokens';
    }

    // Calculer le coût pour Kimi k2.5
    // Prix: $0.60 / 1M tokens input (cache miss), $3.00 / 1M tokens output
    // Note: On utilise le prix "cache miss" par défaut (cas le plus courant)
    const inputTokens = response.usage.prompt_tokens;
    const outputTokens = response.usage.completion_tokens;
    const inputCost = (inputTokens / 1_000_000) * 0.60;
    const outputCost = (outputTokens / 1_000_000) * 3.00;

    return {
      content,
      stopReason,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens
      },
      cost: {
        input_cost: inputCost,
        output_cost: outputCost,
        total_cost: inputCost + outputCost
      }
    };
  }
}
