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
  private contextEnabled: boolean = false;
  // Map pour stocker les HistoryManager actifs par thread (isolation par requête)
  private activeHistoryManagers: Map<string, HistoryManager> = new Map();

  constructor(apiKey: string, identityPath?: string) {
    this.promptBuilder = new PromptBuilder(identityPath);
    this.providerManager = new ProviderManager({ anthropic: apiKey });
    
    console.log(`[Brain] Initialized (thread-isolated mode)`);
  }

  /**
   * Récupère ou crée un HistoryManager pour un thread donné
   * Garantit l'isolation entre threads parallèles
   */
  private getHistoryManager(threadId?: string): HistoryManager {
    if (!threadId) {
      // Fallback: créer un HistoryManager temporaire non partagé
      return new HistoryManager();
    }

    // Nettoyer les HistoryManager inactifs (garbage collection simple)
    if (this.activeHistoryManagers.size > 100) {
      const entries = Array.from(this.activeHistoryManagers.entries());
      const toDelete = entries.slice(0, entries.length - 50);
      for (const [id] of toDelete) {
        this.activeHistoryManagers.delete(id);
      }
    }

    let manager = this.activeHistoryManagers.get(threadId);
    if (!manager) {
      manager = new HistoryManager();
      manager.setThreadId(threadId);
      manager.loadFromDatabase();
      this.activeHistoryManagers.set(threadId, manager);
    }
    return manager;
  }

  /**
   * Libère le HistoryManager d'un thread (appelé à la fin du traitement)
   */
  releaseHistoryManager(threadId: string): void {
    this.activeHistoryManagers.delete(threadId);
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
   * Penser avec streaming (méthode principale)
   */
  async thinkStream(
    userMessage: string,
    tools: Tool[],
    images?: ImageContent[],
    abortSignal?: AbortSignal,
    onChunk?: StreamCallback,
    source?: 'webapp' | 'telegram',
    threadId?: string,
    threadTitle?: string
  ): Promise<BrainResponse> {
    // CRITICAL: Créer un HistoryManager LOCAL pour cette requête uniquement
    // Cela garantit l'isolation entre threads parallèles
    const historyManager = new HistoryManager();
    
    if (threadId) {
      historyManager.setThreadId(threadId);
      historyManager.loadFromDatabase();
    }

    // Ajouter le message à l'historique
    historyManager.addUserMessage(userMessage, images);

    // Injecter le contexte pertinent avec infos du thread
    await this.promptBuilder.updateWithContext(userMessage, threadId, threadTitle);

    // Vérifier si compression nécessaire
    const messageCount = historyManager.getMessageCount();
    if (this.contextEnabled && messageCount % MEMORY.COMPRESSION_CHECK_INTERVAL === 0) {
      this.triggerCompressionAsync(threadId);
    }

    // Préparer les données (avec horodatages pour l'API)
    const apiHistory = historyManager.getHistoryForAPI();
    const aiTools = this.formatTools(tools);

    // Appeler le provider
    const response = await this.providerManager.chatStreamWithFallback(apiHistory, {
      system: this.promptBuilder.getSystemPrompt(source),
      tools: aiTools,
      abortSignal,
      onChunk
    });

    // Sauvegarder la réponse
    historyManager.addAssistantMessage(response.content);

    return this.formatResponse(response);
  }

  /**
   * Penser sans streaming (pour compatibilité)
   */
  async think(
    userMessage: string,
    tools: Tool[],
    images?: ImageContent[],
    abortSignal?: AbortSignal,
    source?: 'webapp' | 'telegram',
    threadId?: string
  ): Promise<BrainResponse> {
    // CRITICAL: Créer un HistoryManager LOCAL pour cette requête uniquement
    const historyManager = new HistoryManager();
    
    if (threadId) {
      historyManager.setThreadId(threadId);
      historyManager.loadFromDatabase();
    }

    historyManager.addUserMessage(userMessage, images);

    await this.promptBuilder.updateWithContext(userMessage, threadId);

    const messageCount = historyManager.getMessageCount();
    if (this.contextEnabled && messageCount % MEMORY.COMPRESSION_CHECK_INTERVAL === 0) {
      this.triggerCompressionAsync(threadId);
    }

    const apiHistory = historyManager.getHistoryForAPI();
    const aiTools = this.formatTools(tools);

    const response = await this.providerManager.chatWithFallback(apiHistory, {
      system: this.promptBuilder.getSystemPrompt(source),
      tools: aiTools,
      abortSignal
    });

    historyManager.addAssistantMessage(response.content);

    return this.formatResponse(response);
  }

  /**
   * Continuer après un résultat d'outil (streaming)
   */
  async continueAfterToolStream(
    tools: Tool[],
    abortSignal?: AbortSignal,
    onChunk?: StreamCallback,
    threadId?: string
  ): Promise<BrainResponse> {
    // CRITICAL: Récupérer le HistoryManager pour ce thread (créé dans thinkStream)
    const historyManager = threadId ? this.getHistoryManager(threadId) : new HistoryManager();

    const apiHistory = historyManager.getHistoryForAPI();
    const aiTools = this.formatTools(tools);

    const response = await this.providerManager.chatStreamWithFallback(apiHistory, {
      system: this.promptBuilder.getSystemPrompt(),
      tools: aiTools,
      abortSignal,
      onChunk
    });

    historyManager.addAssistantMessage(response.content);

    return this.formatResponse(response);
  }

  /**
   * Continuer après un résultat d'outil (sans streaming)
   */
  async continueAfterTool(
    tools: Tool[],
    abortSignal?: AbortSignal,
    threadId?: string
  ): Promise<BrainResponse> {
    // CRITICAL: Récupérer le HistoryManager pour ce thread
    const historyManager = threadId ? this.getHistoryManager(threadId) : new HistoryManager();

    const apiHistory = historyManager.getHistoryForAPI();
    const aiTools = this.formatTools(tools);

    const response = await this.providerManager.chatWithFallback(apiHistory, {
      system: this.promptBuilder.getSystemPrompt(),
      tools: aiTools,
      abortSignal
    });

    historyManager.addAssistantMessage(response.content);

    return this.formatResponse(response);
  }

  /**
   * Charge l'historique depuis la base de données pour un thread
   */
  loadHistory(threadId?: string): void {
    if (threadId) {
      const manager = this.getHistoryManager(threadId);
      manager.loadFromDatabase();
    }
  }

  /**
   * Efface l'historique d'un thread spécifique
   */
  clearHistory(threadId?: string): void {
    if (threadId) {
      this.activeHistoryManagers.delete(threadId);
    } else {
      this.activeHistoryManagers.clear();
    }
  }

  /**
   * Retourne l'historique d'un thread
   */
  getHistory(threadId?: string): AIMessage[] {
    if (threadId) {
      const manager = this.getHistoryManager(threadId);
      return manager.getHistory();
    }
    return [];
  }

  /**
   * Vérifie si c'est une nouvelle session
   */
  isNewSession(threadId?: string): boolean {
    if (threadId) {
      const manager = this.getHistoryManager(threadId);
      return manager.isNewSession();
    }
    return true;
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
   * Déclenche la compression en arrière-plan pour un thread spécifique
   */
  private triggerCompressionAsync(threadId?: string): void {
    this.promptBuilder.maybeCompress(threadId)
      .then(compressed => {
        if (compressed) {
          console.log(`[Brain] Conversation history compressed for thread ${threadId || 'global'}`);
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
