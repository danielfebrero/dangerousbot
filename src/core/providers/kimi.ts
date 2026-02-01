/**
 * Kimi Provider - Moonshot AI (Kimi 2.5)
 * Implémentation avec BaseProvider
 */

import { BaseProvider } from './base-provider.js';
import { AIMessage, AIResponse, AIToolDefinition, AIContentBlock, AIProviderConfig } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface KimiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{type: 'text'; text: string} | {type: 'image_url'; image_url: {url: string}}> | null;
  reasoning_content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface KimiResponse {
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      reasoning_content?: string | null;
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

export class KimiProvider extends BaseProvider {
  readonly name = 'kimi';
  private baseUrl = 'https://api.moonshot.ai/v1';

  protected costConfig = {
    inputCostPerMillion: 0.60,   // Kimi k2.5: $0.60/M input
    outputCostPerMillion: 3.00   // Kimi k2.5: $3.00/M output
  };

  constructor(config: AIProviderConfig) {
    super(config);
  }

  supportsTools(): boolean {
    return true;
  }

  protected convertMessages(messages: AIMessage[]): KimiMessage[] {
    // IMPORTANT: Kimi reuses tool_call_ids like "read_file:0", "read_file:1"
    // We must process in order and track "pending" tool_calls
    // A tool_result is only valid if its ID is currently pending (defined BEFORE it)

    const result: KimiMessage[] = [];
    // Track pending tool_call IDs - a Set that accumulates tool_use IDs as we go
    // When we see a tool_result, we check if its ID is pending
    const pendingToolCalls = new Set<string>();

    for (const msg of messages) {
      // Handle null/undefined content
      if (msg.content === null || msg.content === undefined) {
        if (msg.role === 'assistant' && (msg as any).tool_calls) {
          // Assistant message with tool_calls but no content
          result.push({
            role: 'assistant',
            content: null,
            tool_calls: (msg as any).tool_calls
          });
        } else {
          result.push({ role: msg.role, content: '' });
        }
        continue;
      }

      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
        continue;
      }

      // Gestion des content blocks
      if (msg.role === 'assistant') {
        let textContent = '';
        const toolCalls: KimiMessage['tool_calls'] = [];

        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            textContent += block.text;
          } else if (block.type === 'tool_use' && block.id) {
            // Add ALL tool_use IDs to pending - we'll filter later
            pendingToolCalls.add(block.id);
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name || '',
                arguments: JSON.stringify(block.input || {})
              }
            });
          }
        }

        if (!textContent && toolCalls.length === 0) continue;

        const assistantMsg: KimiMessage = {
          role: 'assistant',
          content: textContent || null
        };

        if (toolCalls.length > 0) {
          assistantMsg.reasoning_content = textContent || 'Processing...';
          assistantMsg.content = null;
          assistantMsg.tool_calls = toolCalls;
        }

        result.push(assistantMsg);

      } else if (msg.role === 'user') {
        const toolResults: KimiMessage[] = [];
        const contentParts: Array<{type: 'text'; text: string} | {type: 'image_url'; image_url: {url: string}}> = [];
        let hasToolResults = false;

        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            contentParts.push({ type: 'text', text: block.text });
          } else if (block.type === 'image' && block.source) {
            const dataUrl = `data:${block.source.media_type};base64,${block.source.data}`;
            contentParts.push({ type: 'image_url', image_url: { url: dataUrl } });
          } else if (block.type === 'tool_result') {
            // Only include tool_result if its ID is in pendingToolCalls
            // This ensures the tool_use came BEFORE this tool_result
            if (block.tool_use_id && pendingToolCalls.has(block.tool_use_id)) {
              hasToolResults = true;
              // Remove from pending since it's now resolved
              pendingToolCalls.delete(block.tool_use_id);
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
            } else {
              console.warn(`[Kimi] Skipping orphaned tool_result with id: ${block.tool_use_id} (not in pending: ${Array.from(pendingToolCalls).join(', ')})`);
            }
          }
        }

        result.push(...toolResults);

        // Don't push user content if this was a tool_result message
        // (would only contain timestamp text which breaks Kimi's tool_call sequence)
        if (!hasToolResults && contentParts.length > 0) {
          if (contentParts.length === 1 && contentParts[0].type === 'text') {
            result.push({ role: 'user', content: contentParts[0].text });
          } else {
            result.push({ role: 'user', content: contentParts });
          }
        }
      }
    }

    // Now pendingToolCalls contains tool_use IDs that were never resolved
    // We need to remove those from the result
    if (pendingToolCalls.size > 0) {
      console.warn(`[Kimi] ${pendingToolCalls.size} unresolved tool_calls: ${Array.from(pendingToolCalls).join(', ')}`);
    }

    // Collect all tool_call IDs that were resolved (have tool results)
    const resolvedToolCallIds = new Set<string>();
    for (const msg of result) {
      if (msg.role === 'tool' && msg.tool_call_id) {
        resolvedToolCallIds.add(msg.tool_call_id);
      }
    }

    // Strip unresolved tool_calls from assistant messages
    for (const msg of result) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        const resolvedToolCalls = msg.tool_calls.filter(tc => resolvedToolCallIds.has(tc.id));
        if (resolvedToolCalls.length !== msg.tool_calls.length) {
          console.warn(`[Kimi] Stripped ${msg.tool_calls.length - resolvedToolCalls.length} unresolved tool_calls from assistant message`);
        }
        if (resolvedToolCalls.length === 0) {
          delete msg.tool_calls;
          // Restore content if it was nullified
          if (msg.content === null && msg.reasoning_content) {
            msg.content = msg.reasoning_content;
          }
        } else {
          msg.tool_calls = resolvedToolCalls;
        }
      }
    }

    // Final filter: remove any remaining orphan tool messages (shouldn't happen but safety check)
    const finalToolCallIds = new Set<string>();
    for (const msg of result) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          finalToolCallIds.add(tc.id);
        }
      }
    }

    const filteredResult = result.filter(msg => {
      if (msg.role === 'tool' && msg.tool_call_id) {
        if (!finalToolCallIds.has(msg.tool_call_id)) {
          console.error(`[Kimi] Final filter removing orphaned tool message: ${msg.tool_call_id}`);
          return false;
        }
      }
      return true;
    });

    return filteredResult;
  }

  protected convertTools(tools?: AIToolDefinition[]): unknown[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map(tool => {
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

  protected async makeApiCall(
    messages: KimiMessage[],
    tools: unknown[] | undefined,
    system: string | undefined,
    maxTokens: number,
    abortSignal?: AbortSignal
  ): Promise<KimiResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      max_tokens: maxTokens,
      temperature: 1.0
    };

    if (tools) {
      body.tools = tools;
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
      throw new Error(`Kimi API error: ${response.status} - ${error}`);
    }

    return await response.json() as KimiResponse;
  }

  protected parseResponse(response: KimiResponse): AIResponse {
    const choice = response.choices[0];
    const message = choice.message;
    const content: AIContentBlock[] = [];

    const textContent = message.content || message.reasoning_content || '';
    if (textContent) {
      content.push({ type: 'text', text: textContent });
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

  /**
   * Parse les arguments JSON de manière robuste, même si le JSON est tronqué/malformé.
   * Tente d'extraire le maximum de données utilisables.
   */
  private robustParseArguments(jsonStr: string, toolName: string): {
    success: boolean;
    partial: boolean;
    data: Record<string, unknown>;
    warning?: string;
  } {
    // 1. Essayer le parsing JSON standard
    try {
      const parsed = JSON.parse(jsonStr);
      return { success: true, partial: false, data: parsed };
    } catch {
      // Continue avec le parsing robuste
    }

    // 2. Parsing robuste pour JSON tronqué
    const result: Record<string, unknown> = {};
    let warning = '';

    // Extraire les champs connus selon le type d'outil
    const fieldPatterns: Record<string, string[]> = {
      write_file: ['path', 'content'],
      edit_file: ['path', 'old_content', 'new_content', 'old_string', 'new_string'],
      read_file: ['path'],
      delete_file: ['path'],
      shell: ['command', 'cwd'],
      execute_code: ['code', 'language'],
      default: ['path', 'content', 'command', 'query', 'text', 'message', 'name', 'value']
    };

    const fieldsToExtract = fieldPatterns[toolName] || fieldPatterns.default;

    for (const field of fieldsToExtract) {
      const extracted = this.extractJsonField(jsonStr, field);
      if (extracted.found) {
        result[field] = extracted.value;
        if (extracted.truncated) {
          warning += `Field '${field}' may be truncated. `;
          // Marquer le résultat comme partiel
          (result as any)._partialParse = true;
          (result as any)._truncatedFields = (result as any)._truncatedFields || [];
          (result as any)._truncatedFields.push(field);
        }
      }
    }

    const hasData = Object.keys(result).filter(k => !k.startsWith('_')).length > 0;

    if (hasData) {
      console.warn(`[Kimi] Robust parse recovered ${Object.keys(result).filter(k => !k.startsWith('_')).length} field(s) from malformed JSON for ${toolName}`);
    }

    return {
      success: false,
      partial: hasData,
      data: result,
      warning: warning || 'JSON parsing failed, attempted field extraction'
    };
  }

  /**
   * Extrait un champ spécifique d'un JSON potentiellement malformé.
   */
  private extractJsonField(jsonStr: string, fieldName: string): {
    found: boolean;
    value: unknown;
    truncated: boolean;
  } {
    // Pattern pour trouver "fieldName": "value" ou "fieldName": value
    // Gère les chaînes avec échappements
    const stringPattern = new RegExp(
      `"${fieldName}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)(?:"|$)`,
      's'
    );

    const stringMatch = jsonStr.match(stringPattern);
    if (stringMatch) {
      let value = stringMatch[1];
      // Vérifier si la valeur est tronquée (pas de guillemet fermant)
      const fullPattern = new RegExp(`"${fieldName}"\\s*:\\s*"(?:[^"\\\\]|\\\\.)*"`, 's');
      const isTruncated = !fullPattern.test(jsonStr);

      // Décoder les échappements JSON
      try {
        value = JSON.parse(`"${value}"`);
      } catch {
        // Garder la valeur brute si le décodage échoue
        value = value.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }

      return { found: true, value, truncated: isTruncated };
    }

    // Essayer pour les valeurs non-string (nombres, booléens, null)
    const nonStringPattern = new RegExp(`"${fieldName}"\\s*:\\s*(\\d+|true|false|null)`, 's');
    const nonStringMatch = jsonStr.match(nonStringPattern);
    if (nonStringMatch) {
      let value: unknown = nonStringMatch[1];
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value === 'null') value = null;
      else value = Number(value);
      return { found: true, value, truncated: false };
    }

    return { found: false, value: undefined, truncated: false };
  }

  protected async* makeStreamingApiCall(
    messages: KimiMessage[],
    tools: unknown[] | undefined,
    system: string | undefined,
    maxTokens: number,
    abortSignal?: AbortSignal
  ): AsyncGenerator<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown } | { type: 'usage'; inputTokens: number; outputTokens: number } | { type: 'finish'; reason: string | null }, void, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      max_tokens: maxTokens,
      temperature: 1.0,
      stream: true,
      stream_options: { include_usage: true }
    };

    if (tools) {
      body.tools = tools;
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
      throw new Error(`Kimi API error: ${response.status} - ${error}`);
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

    // Émettre les tool calls complétés (avec parsing robuste pour les JSON tronqués)
    for (const [, toolCall] of pendingToolCalls) {
      if (toolCall.name) {
        const parseResult = this.robustParseArguments(toolCall.arguments || '{}', toolCall.name);

        // Compter seulement les champs de données (pas les métadonnées _xxx)
        const dataFieldCount = Object.keys(parseResult.data).filter(k => !k.startsWith('_')).length;

        if (!parseResult.success && dataFieldCount === 0) {
          // Échec total du parsing, skip
          console.error(`[Kimi] Skipping tool_use '${toolCall.name}' (id: ${toolCall.id}) - no usable data extracted. Arguments:`, toolCall.arguments);
          continue;
        }

        if (parseResult.partial) {
          console.warn(`[Kimi] Partial parse for tool_use '${toolCall.name}' (id: ${toolCall.id}): ${parseResult.warning}`);
          console.warn(`[Kimi] Extracted fields: ${Object.keys(parseResult.data).filter(k => !k.startsWith('_')).join(', ')}`);
        }

        yield {
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: parseResult.data
        };
      }
    }
  }
}
