/**
 * Brain - Cerveau de DangerousBot
 * Architecture modulaire avec séparation des responsabilités
 */

import { Tool, BrainResponse, AIContentBlock, AIMessage, ProviderType, ImageContent } from './types.js';
import { PromptBuilder } from './prompt-builder.js';
import { ProviderManager } from './provider-manager.js';
import { HistoryManager } from './history-manager.js';
import { initEmbeddingService } from '../embedding.js';
import { initCompressor } from '../compressor.js';
import { MEMORY } from '../../config.js';
import { StreamCallback } from '../providers/index.js';

export class Brain {
  private promptBuilder: PromptBuilder;
  private providerManager: ProviderManager;
  private historyManager: HistoryManager;
  private contextEnabled: boolean = false;

  constructor(apiKey: string, identityPath?: string) {
    this.promptBuilder = new PromptBuilder(identityPath);
    this.providerManager = new ProviderManager({ anthropic: apiKey });
    this.historyManager = new HistoryManager();
    
    console.log(`[Brain] Initialized`);
  }

  /**
   * Change le provider actif (hot-swap)
   */
  switchProvider(provider: ProviderType): void {
    this.providerManager.switchProvider(provider);
  }

  /**
   * Retourne le provider actuel
   */
  getCurrentProvider(): { name: string; model: string } {
    return this.providerManager.getCurrentProvider();
  }

  /**
   * Définit la clé API Kimi
   */
  setKimiApiKey(apiKey: string): void {
    this.providerManager.setKimiApiKey(apiKey);
  }

  /**
   * Initialise le système de contexte (embeddings + compression)
   */
  initContextSystem(openRouterApiKey: string, anthropicApiKey: string): void {
    try {
      this.providerManager.setOpenRouterApiKey(openRouterApiKey);
      initEmbeddingService(openRouterApiKey);
      initCompressor(anthropicApiKey);
      this.promptBuilder.enableContext();
      this.contextEnabled = true;
      console.log('[Brain] Context injection system initialized');
    } catch (error) {
      console.error('[Brain] Failed to init context system:', error);
      this.contextEnabled = false;
    }
  }

  /**
   * Ajoute un message utilisateur
   */
  addUserMessage(content: string, images?: ImageContent[]): void {
    this.historyManager.addUserMessage(content, images);
  }

  /**
   * Ajoute un message assistant
   */
  addAssistantMessage(content: AIContentBlock[]): void {
    this.historyManager.addAssistantMessage(content);
  }

  /**
   * Ajoute un résultat d'outil
   */
  addToolResult(toolUseId: string, result: string): void {
    this.historyManager.addToolResult(toolUseId, result);
  }

  /**
   * Penser avec streaming (méthode principale)
   */
  async thinkStream(
    userMessage: string,
    tools: Tool[],
    images?: ImageContent[],
    abortSignal?: AbortSignal,
    onChunk?: StreamCallback
  ): Promise<BrainResponse> {
    // Ajouter le message à l'historique
    this.historyManager.addUserMessage(userMessage, images);

    // Injecter le contexte pertinent
    await this.promptBuilder.updateWithContext(userMessage);

    // Vérifier si compression nécessaire
    const messageCount = this.historyManager.getMessageCount();
    if (this.contextEnabled && messageCount % MEMORY.COMPRESSION_CHECK_INTERVAL === 0) {
      this.triggerCompressionAsync();
    }

    // Préparer les données (avec horodatages pour l'API)
    const apiHistory = this.historyManager.getHistoryForAPI();
    const aiTools = this.formatTools(tools);

    // Appeler le provider
    const response = await this.providerManager.chatStreamWithFallback(apiHistory, {
      system: this.promptBuilder.getSystemPrompt(),
      tools: aiTools,
      abortSignal,
      onChunk
    });

    // Sauvegarder la réponse
    this.historyManager.addAssistantMessage(response.content);

    return this.formatResponse(response);
  }

  /**
   * Penser sans streaming (pour compatibilité)
   */
  async think(
    userMessage: string,
    tools: Tool[],
    images?: ImageContent[],
    abortSignal?: AbortSignal
  ): Promise<BrainResponse> {
    this.historyManager.addUserMessage(userMessage, images);

    await this.promptBuilder.updateWithContext(userMessage);

    const messageCount = this.historyManager.getMessageCount();
    if (this.contextEnabled && messageCount % MEMORY.COMPRESSION_CHECK_INTERVAL === 0) {
      this.triggerCompressionAsync();
    }

    const apiHistory = this.historyManager.getHistoryForAPI();
    const aiTools = this.formatTools(tools);

    const response = await this.providerManager.chatWithFallback(apiHistory, {
      system: this.promptBuilder.getSystemPrompt(),
      tools: aiTools,
      abortSignal
    });

    this.historyManager.addAssistantMessage(response.content);

    return this.formatResponse(response);
  }

  /**
   * Continuer après un résultat d'outil (streaming)
   */
  async continueAfterToolStream(
    tools: Tool[],
    abortSignal?: AbortSignal,
    onChunk?: StreamCallback
  ): Promise<BrainResponse> {
    const apiHistory = this.historyManager.getHistoryForAPI();
    const aiTools = this.formatTools(tools);

    const response = await this.providerManager.chatStreamWithFallback(apiHistory, {
      system: this.promptBuilder.getSystemPrompt(),
      tools: aiTools,
      abortSignal,
      onChunk
    });

    this.historyManager.addAssistantMessage(response.content);

    return this.formatResponse(response);
  }

  /**
   * Continuer après un résultat d'outil (sans streaming)
   */
  async continueAfterTool(
    tools: Tool[],
    abortSignal?: AbortSignal
  ): Promise<BrainResponse> {
    const apiHistory = this.historyManager.getHistoryForAPI();
    const aiTools = this.formatTools(tools);

    const response = await this.providerManager.chatWithFallback(apiHistory, {
      system: this.promptBuilder.getSystemPrompt(),
      tools: aiTools,
      abortSignal
    });

    this.historyManager.addAssistantMessage(response.content);

    return this.formatResponse(response);
  }

  /**
   * Charge l'historique depuis la base de données
   */
  loadHistory(): void {
    this.historyManager.loadFromDatabase();
  }

  /**
   * Efface l'historique
   */
  clearHistory(): void {
    this.historyManager.clear();
  }

  /**
   * Retourne l'historique
   */
  getHistory(): AIMessage[] {
    return this.historyManager.getHistory();
  }

  /**
   * Vérifie si c'est une nouvelle session
   */
  isNewSession(): boolean {
    return this.historyManager.isNewSession();
  }

  // --- Méthodes privées ---

  /**
   * Formate les tools pour l'API
   */
  private formatTools(tools: Tool[]): { name: string; description: string; input_schema: any }[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    }));
  }

  /**
   * Formate la réponse du provider
   */
  private formatResponse(response: any): BrainResponse {
    return {
      content: response.content.map((block: any) => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text || '' };
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id || '',
            name: block.name || '',
            input: block.input
          };
        }
        return { type: 'text' as const, text: '' };
      }),
      stopReason: response.stopReason,
      usage: response.usage,
      cost: response.cost
    };
  }

  /**
   * Déclenche la compression en arrière-plan
   */
  private triggerCompressionAsync(): void {
    this.promptBuilder.maybeCompress()
      .then(compressed => {
        if (compressed) {
          console.log('[Brain] Conversation history compressed');
        }
      })
      .catch(err => console.error('[Brain] Compression error:', err));
  }
}

// Export des sous-modules pour usage direct si nécessaire
export { PromptBuilder } from './prompt-builder.js';
export { ProviderManager } from './provider-manager.js';
export { HistoryManager } from './history-manager.js';
export * from './types.js';
