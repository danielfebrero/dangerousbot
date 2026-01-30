/**
 * Kimi Provider - Moonshot AI (Kimi 2.5)
 * Compatible avec le format OpenAI
 */

import { AIProvider, AIMessage, AIResponse, AIToolDefinition, AIContentBlock, AIProviderConfig } from './types.js';

interface KimiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
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
      body.tools = options.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema
        }
      }));
    }

    // Appeler l'API
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
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
      
      // Collecter le texte et les tool_calls pour les messages assistant
      if (msg.role === 'assistant') {
        let textContent = '';
        const toolCalls: Array<{id: string; type: 'function'; function: {name: string; arguments: string}}> = [];
        let reasoningContent = '';
        
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
        // Pour les messages user, extraire les tool_results et le texte
        const toolResults: KimiChatMessage[] = [];
        let textContent = '';
        
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            textContent += block.text;
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
        
        // Puis le texte user s'il y en a
        if (textContent) {
          result.push({ role: 'user', content: textContent });
        }
      }
    }
    
    return result;
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
