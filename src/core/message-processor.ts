/**
 * MessageProcessor - Traitement unifié des messages avec support des tools
 * Utilisé par le serveur web et le bot Telegram
 */

import { ProviderManager } from './brain/provider-manager.js';
import { getToolDefinitions } from './tools/index.js';
import { ToolExecutor } from './tools.js';
import { getContextInjector } from './context-injector.js';
import { getMemory } from './memory.js';
import { ToolCall } from './types.js';
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

  /** Contexte spécifique à la plateforme (Telegram, etc.) */
  platformContext?: {
    telegramChatId?: string;
    bot?: any;
  };
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
    const { source, conversationId, historyLimit = 20, callbacks, platformContext } = options;

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
      
      // Boucle principale de traitement
      let responseText = '';
      let hasMoreToolCalls = true;
      let iteration = 0;
      const maxIterations = 10; // Limite de sécurité
      const allToolResults: Array<{ name: string; success: boolean; result?: unknown }> = [];

      while (hasMoreToolCalls && iteration < maxIterations) {
        iteration++;
        
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
        responseText = '';
        const toolCalls: Array<{ name: string; input: Record<string, unknown>; id: string }> = [];

        for (const block of response.content) {
          if (block.type === 'text') {
            responseText += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              name: block.name,
              input: block.input as Record<string, unknown>,
              id: block.id,
            });
          }
        }

        // S'il n'y a pas de tool calls, on a fini
        if (toolCalls.length === 0) {
          hasMoreToolCalls = false;
          break;
        }

        // Exécuter TOUS les tools de cette itération avec le contexte de la plateforme
        const iterationResults: Array<{ name: string; success: boolean; result?: unknown; id: string }> = [];
        for (const tc of toolCalls) {
          try {
            const result = await this.toolExecutor.execute(
              tc.name, 
              tc.input,
              platformContext
            );
            iterationResults.push({
              name: tc.name,
              success: result.success !== false,
              result,
              id: tc.id,
            });
          } catch (e) {
            const error = e as Error;
            iterationResults.push({
              name: tc.name,
              success: false,
              result: { success: false, error: error.message },
              id: tc.id,
            });
          }
        }
        
        allToolResults.push(...iterationResults);

        // Ajouter le message assistant avec les tool calls
        (messages as any[]).push({
          role: 'assistant',
          content: response.content,
        });

        // Ajouter TOUS les résultats de tools avec le bon tool_use_id
        for (const tr of iterationResults) {
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
        await callbacks?.onToolsExecuted?.(iterationResults);
        
        // Continuer la boucle pour potentiellement d'autres tool calls
      }

      // Sauvegarder dans la mémoire avec la source et les images
      if (conversationId) {
        // Convertir les images au format attendu par la DB
        const imagesForDb = message.images?.map(img => ({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: img.mimeType,
            data: img.data
          }
        }));
        
        memory.addMessage('user', message.text, undefined, imagesForDb, source);
        memory.addMessage('assistant', responseText, undefined, undefined, source);
      }

      // Notifier la fin du traitement
      await callbacks?.onProcessingEnd?.();

      return {
        text: responseText,
        toolCalls: allToolResults,
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
