/**
 * MessageProcessor - Traitement unifié des messages avec support des tools
 * Utilisé par le serveur web et le bot Telegram
 */

import { ProviderManager } from './brain/provider-manager.js';
import { getToolDefinitions } from './tools/index.js';
import { ToolExecutor } from './tools.js';
import { getChatContextService, ChatContextService } from './chat-context-service.js';
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
  private contextService: ChatContextService;

  constructor(config: MessageProcessorConfig) {
    this.config = config;
    const projectRoot = path.resolve(process.cwd());
    this.toolExecutor = new ToolExecutor(projectRoot);
    this.contextService = getChatContextService();
  }

  /**
   * Traite un message et retourne la réponse
   * Utilise ChatContextService pour un contexte intelligent identique à la webapp
   */
  async process(
    message: IncomingMessage,
    options: ProcessOptions
  ): Promise<ProcessingResult> {
    const { source, conversationId, callbacks, platformContext } = options;

    try {
      // Notifier le début du traitement
      await callbacks?.onProcessingStart?.();

      // Convertir les images au format attendu par le context service
      const imagesForContext = message.images?.map(img => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: img.mimeType,
          data: img.data
        }
      }));

      // Construire le contexte complet via le service partagé
      // Cela inclut: historique chargé depuis DB, mémoires compressées, connaissances
      const contextResult = await this.contextService.buildContext(
        message.text,
        source,
        conversationId,
        imagesForContext
      );

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
      
      // Copier les messages pour pouvoir les modifier pendant la boucle
      let messages = [...contextResult.messages];

      while (hasMoreToolCalls && iteration < maxIterations) {
        iteration++;
        
        // Appeler le provider
        const response = await providerManager.chatWithFallback(messages, {
          system: contextResult.systemPrompt,
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          })),
        });

        // Extraire le texte et les tool calls
        // IMPORTANT: On accumule le texte, on ne réinitialise pas (pour ne pas perdre les textes intermédiaires)
        let iterationText = '';
        const toolCalls: Array<{ name: string; input: Record<string, unknown>; id: string }> = [];

        for (const block of response.content) {
          if (block.type === 'text') {
            iterationText += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              name: block.name,
              input: block.input as Record<string, unknown>,
              id: block.id,
            });
          }
        }
        
        // Accumuler le texte de cette itération dans le texte final
        // Seul le dernier texte (sans tool calls) ou les textes significatifs sont gardés
        if (iterationText.trim()) {
          responseText = iterationText;
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
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Ajouter TOUS les résultats de tools avec le bon tool_use_id
        for (const tr of iterationResults) {
          messages.push({
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
        this.contextService.saveUserMessage(
          message.text,
          imagesForContext,
          source,
          conversationId
        );
        this.contextService.saveAssistantMessage(
          responseText,
          source,
          conversationId
        );
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
