/**
 * MessageProcessor - Traitement unifié des messages avec support des tools
 * Utilisé par le serveur web et le bot Telegram
 */

import { ProviderManager } from './brain/provider-manager.js';
import { getToolDefinitions } from './tools/index.js';
import { ToolExecutor } from './tools.js';
import { getContextInjector } from './context-injector.js';
import { getMemory } from './memory.js';
import { ToolCall, AIContentBlock } from './types.js';
import {
  ChatSource,
  ChatImage,
  IncomingMessage,
  ProcessingCallbacks,
  ProcessingResult,
} from './chat-adapter.js';
import * as path from 'path';

/** Configuration du MessageProcessor */
export interface MessageProcessorConfig {
  anthropicApiKey?: string;
  kimiApiKey?: string;
  openRouterApiKey?: string;
}

/** Options de traitement d'un message */
export interface ProcessOptions {
  /** Source du message */
  source: ChatSource;

  /** ID de conversation (optionnel) */
  conversationId?: string;

  /** Historique à inclure (nombre de messages) */
  historyLimit?: number;

  /** Callbacks pour les événements */
  callbacks?: ProcessingCallbacks;
}

/**
 * Classe de traitement des messages
 * Gère l'appel au provider, l'exécution des tools et la continuation
 */
export class MessageProcessor {
  private config: MessageProcessorConfig;
  private toolExecutor: ToolExecutor;

  constructor(config: MessageProcessorConfig) {
    this.config = config;
    const projectRoot = path.resolve(process.cwd());
    this.toolExecutor = new ToolExecutor(projectRoot);
  }

  /**
   * Traite un message et retourne la réponse
   */
  async process(
    message: IncomingMessage,
    options: ProcessOptions
  ): Promise<ProcessingResult> {
    const { source, conversationId, historyLimit = 20, callbacks } = options;

    try {
      // Notifier le début du traitement
      await callbacks?.onProcessingStart?.();

      // Récupérer le contexte
      const injector = getContextInjector();
      const contextBlock = await injector.injectContext(message.text);

      // Construire le system prompt avec instructions selon la source
      const systemPrompt = this.buildSystemPrompt(contextBlock, source);

      // Récupérer l'historique
      const memory = getMemory();
      const history = conversationId
        ? memory.getMessages(conversationId, historyLimit)
        : [];

      // Construire le contenu du message user
      const userContent = this.buildUserContent(message);

      // Construire les messages
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: userContent },
      ];

      // Créer le provider manager
      const providerManager = new ProviderManager({
        anthropic: this.config.anthropicApiKey || '',
        kimi: this.config.kimiApiKey,
        openRouter: this.config.openRouterApiKey,
      });

      // Préparer les tools
      const tools = getToolDefinitions();

      // Appeler le provider
      const response = await providerManager.chatWithFallback(messages, {
        system: systemPrompt,
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
      });

      // Extraire le texte et les tool calls
      let responseText = '';
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }

      // Résultats des tools
      const toolResults: Array<{ name: string; success: boolean; result?: unknown; id: string }> = [];

      // Exécuter les tool calls si présents
      if (toolCalls.length > 0) {
        // D'abord exécuter TOUS les tools
        for (const tc of toolCalls) {
          try {
            const result = await this.toolExecutor.execute(tc.name, tc.arguments);
            toolResults.push({
              id: tc.id,
              name: tc.name,
              success: result.success !== false,
              result,
            });
          } catch (e) {
            const error = e as Error;
            toolResults.push({
              id: tc.id,
              name: tc.name,
              success: false,
              result: { success: false, error: error.message },
            });
          }
        }

        // Ajouter le message assistant UNE SEULE FOIS
        (messages as any[]).push({
          role: 'assistant',
          content: response.content,
        });

        // Ajouter TOUS les résultats de tools
        for (const tr of toolResults) {
          (messages as any[]).push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: tr.id,
              content: JSON.stringify(tr.result),
            }],
          });
        }

        // Notifier les tools exécutés
        await callbacks?.onToolsExecuted?.(toolResults);

        // Continuer avec le provider pour obtenir la réponse finale
        const continuation = await providerManager.chatWithFallback(messages, {
          system: systemPrompt,
          tools: [],
        });

        // Extraire le texte de la continuation
        for (const block of continuation.content) {
          if (block.type === 'text') {
            responseText += block.text;
          }
        }
      }

      // Sauvegarder dans la mémoire
      if (conversationId) {
        memory.addMessage('user', message.text);
        memory.addMessage('assistant', responseText);
      }

      // Notifier la fin du traitement
      await callbacks?.onProcessingEnd?.();

      return {
        text: responseText,
        toolCalls: toolResults,
      };
    } catch (error) {
      await callbacks?.onProcessingEnd?.();
      return {
        text: '',
        toolCalls: [],
        error: error as Error,
      };
    }
  }

  /**
   * Construit le system prompt avec les instructions selon la source
   */
  private buildSystemPrompt(contextBlock: string | null, source: ChatSource): string {
    let prompt = contextBlock || 'Tu es DangerousBot, un assistant IA autonome.';

    prompt += `\n\n## Source du message\nL'utilisateur écrit depuis: ${source}`;

    if (source === 'telegram') {
      prompt += `\n\n## Instructions Telegram
L'utilisateur écrit depuis un appareil mobile (Telegram). Sauf indication contraire:
- Réponds de manière brève et concise
- Évite les longues listes et explications détaillées
- Va droit au but
- Utilise un formatage simple (pas de tableaux complexes)
- Si une réponse longue est nécessaire, propose de la détailler sur demande`;
    }

    return prompt;
  }

  /**
   * Construit le contenu du message user (texte + images)
   */
  private buildUserContent(message: IncomingMessage): any {
    if (!message.images || message.images.length === 0) {
      return message.text;
    }

    const content: any[] = [{ type: 'text', text: message.text }];

    for (const img of message.images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType,
          data: img.data,
        },
      });
    }

    return content;
  }
}

// Singleton
let processorInstance: MessageProcessor | null = null;

export function getMessageProcessor(config?: MessageProcessorConfig): MessageProcessor {
  if (!processorInstance && config) {
    processorInstance = new MessageProcessor(config);
  }
  if (!processorInstance) {
    throw new Error('MessageProcessor not initialized');
  }
  return processorInstance;
}

export function initMessageProcessor(config: MessageProcessorConfig): MessageProcessor {
  processorInstance = new MessageProcessor(config);
  return processorInstance;
}
