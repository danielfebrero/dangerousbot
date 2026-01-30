/**
 * Brain - Cerveau de DangerousBot
 * Avec injection de contexte automatique depuis la mémoire long-terme
 * Supporte plusieurs providers (Claude, Kimi, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, BrainResponse } from './types.js';
import { getMemory } from './memory.js';
import { getContextInjector, ContextInjector } from './context-injector.js';
import { initEmbeddingService } from './embedding.js';
import { initCompressor } from './compressor.js';
import { MODELS, TOKENS, MEMORY, PROVIDER, APIS, setActiveProvider, ProviderType } from '../config.js';
import { cleanOldToolResults } from './contextCleaner.js';
import { AIProvider, AIMessage, AIContentBlock, AIResponse, createProvider } from './providers/index.js';

export class Brain {
  private provider: AIProvider;
  private identity: string;
  private baseIdentity: string;
  private conversationHistory: AIMessage[] = [];
  private contextInjector: ContextInjector | null = null;
  private messageCount: number = 0;
  private contextEnabled: boolean = false;
  
  // Stockage des clés API pour hot-swap
  private apiKeys: {
    anthropic: string;
    kimi?: string;
    openRouter?: string;
  };

  constructor(apiKey: string, identityPath?: string) {
    this.apiKeys = { anthropic: apiKey };
    this.baseIdentity = this.loadIdentity(identityPath);
    this.identity = this.baseIdentity;
    
    // Créer le provider initial
    this.provider = this.createCurrentProvider();
    console.log(`[Brain] Initialized with provider: ${this.provider.name} (${this.provider.model})`);
  }

  /**
   * Crée le provider selon la config actuelle
   */
  private createCurrentProvider(): AIProvider {
    const providerType = PROVIDER.ACTIVE;
    
    if (providerType === 'kimi') {
      const kimiKey = this.apiKeys.kimi || APIS.KIMI_API_KEY;
      if (!kimiKey) {
        console.warn('[Brain] Kimi API key not found, falling back to Claude');
        return createProvider({
          provider: 'claude',
          apiKey: this.apiKeys.anthropic,
          model: MODELS.BRAIN,
          maxTokens: TOKENS.MAX_RESPONSE
        });
      }
      return createProvider({
        provider: 'kimi',
        apiKey: kimiKey,
        model: MODELS.KIMI_DEFAULT,
        maxTokens: TOKENS.MAX_RESPONSE
      });
    }
    
    // Default: Claude
    return createProvider({
      provider: 'claude',
      apiKey: this.apiKeys.anthropic,
      model: MODELS.BRAIN,
      maxTokens: TOKENS.MAX_RESPONSE
    });
  }

  /**
   * Change le provider actif (hot-swap)
   */
  switchProvider(provider: ProviderType): void {
    setActiveProvider(provider);
    this.provider = this.createCurrentProvider();
    console.log(`[Brain] Switched to provider: ${this.provider.name} (${this.provider.model})`);
  }

  /**
   * Retourne le provider actuel
   */
  getCurrentProvider(): { name: string; model: string } {
    return { name: this.provider.name, model: this.provider.model };
  }

  /**
   * Définit la clé API Kimi
   */
  setKimiApiKey(apiKey: string): void {
    this.apiKeys.kimi = apiKey;
  }

  /**
   * Initialise le système de contexte (embeddings + compression)
   */
  initContextSystem(openRouterApiKey: string, anthropicApiKey: string): void {
    try {
      this.apiKeys.openRouter = openRouterApiKey;
      initEmbeddingService(openRouterApiKey);
      initCompressor(anthropicApiKey);
      this.contextInjector = getContextInjector();
      this.contextEnabled = true;
      console.log('[Brain] Context injection system initialized');
    } catch (error) {
      console.error('[Brain] Failed to init context system:', error);
      this.contextEnabled = false;
    }
  }

  private loadIdentity(customPath?: string): string {
    const paths = [
      customPath,
      path.join(process.cwd(), 'identity', 'instructions.md'),
      path.join(__dirname, '..', '..', 'identity', 'instructions.md'),
      path.join(__dirname, '..', 'identity', 'instructions.md')
    ].filter(Boolean) as string[];

    for (const p of paths) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf-8');
      }
    }

    return `Tu es DangerousBot, un programme IA autonome et évolutif.
Tu peux modifier ton propre code, exécuter des commandes, et interagir avec l'utilisateur.
Tu es curieux, adaptable et tu cherches à comprendre les besoins de l'utilisateur.`;
  }

  // Ajouter un message utilisateur à l'historique (support multi-modal)
  addUserMessage(content: string, images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>): void {
    if (images && images.length > 0) {
      // Multi-modal: créer un tableau de content blocks
      const contentBlocks: any[] = [{ type: 'text', text: content }];
      for (const img of images) {
        contentBlocks.push({
          type: 'image',
          source: img.source
        });
      }
      this.conversationHistory.push({ role: 'user', content: contentBlocks });
    } else {
      // Texte simple
      this.conversationHistory.push({ role: 'user', content });
    }
  }

  // Ajouter un message assistant à l'historique
  addAssistantMessage(content: AIContentBlock[]): void {
    this.conversationHistory.push({ role: 'assistant', content });
  }

  // Ajouter un résultat d'outil
  addToolResult(toolUseId: string, result: string): void {
    this.conversationHistory.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result
      }]
    });
  }

  /**
   * Nettoie l'historique pour l'envoi à l'API
   */
  private getCleanedHistory(): AIMessage[] {
    return cleanOldToolResults(this.conversationHistory as any[]) as AIMessage[];
  }

  // Penser avec des outils (support multi-modal)
  async think(userMessage: string, tools: Tool[], images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>, abortSignal?: AbortSignal): Promise<BrainResponse> {
    this.addUserMessage(userMessage, images);
    this.messageCount++;

    // Injecter le contexte pertinent depuis la mémoire long-terme
    await this.updateContextualIdentity(userMessage);

    // Vérifier si compression nécessaire
    if (this.contextEnabled && this.messageCount % MEMORY.COMPRESSION_CHECK_INTERVAL === 0) {
      this.triggerCompressionAsync();
    }

    // Nettoyer les anciens tool_results volumineux
    const cleanedHistory = this.getCleanedHistory();

    // Convertir les tools au format unifié
    const aiTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    }));

    // Essayer avec le provider actuel, fallback si erreur
    const response = await this.chatWithFallback(cleanedHistory, aiTools, abortSignal);

    this.addAssistantMessage(response.content);

    return {
      content: response.content.map(block => {
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
      usage: response.usage
    };
  }

  /**
   * Essaie d'appeler le provider, avec fallback automatique si erreur
   */
  private async chatWithFallback(
    messages: AIMessage[],
    tools: { name: string; description: string; input_schema: any }[],
    abortSignal?: AbortSignal
  ): Promise<AIResponse> {
    const providers: ProviderType[] = ['claude', 'kimi'];
    const currentProviderName = this.provider.name as ProviderType;
    
    // Réorganiser pour essayer le provider actuel en premier
    const orderedProviders = [
      currentProviderName,
      ...providers.filter(p => p !== currentProviderName)
    ];

    let lastError: Error | null = null;

    for (const providerName of orderedProviders) {
      try {
        // Si ce n'est pas le provider actuel, switcher
        if (providerName !== this.provider.name) {
          console.log(`[Brain] Fallback: switching to ${providerName}`);
          this.switchProvider(providerName);
          
          // Signaler le changement de provider
          (global as any).__providerSwitched = {
            from: currentProviderName,
            to: providerName,
            reason: lastError?.message || 'Provider unavailable'
          };
        }

        const response = await this.provider.chat(messages, {
          system: this.identity,
          tools,
          maxTokens: TOKENS.MAX_RESPONSE,
          abortSignal
        });

        return response;
      } catch (error) {
        lastError = error as Error;
        const errorMsg = lastError.message.toLowerCase();
        
        // Erreurs qui justifient un fallback
        const shouldFallback = 
          errorMsg.includes('insufficient') ||
          errorMsg.includes('balance') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('401') ||
          errorMsg.includes('authentication') ||
          errorMsg.includes('unauthorized') ||
          errorMsg.includes('invalid') ||
          errorMsg.includes('503') ||
          errorMsg.includes('502') ||
          errorMsg.includes('500') ||
          errorMsg.includes('overloaded') ||
          errorMsg.includes('unavailable');

        if (shouldFallback) {
          console.error(`[Brain] Provider ${providerName} failed: ${lastError.message}`);
          continue; // Essayer le prochain provider
        }

        // Autres erreurs: ne pas fallback, propager l'erreur
        throw error;
      }
    }

    // Tous les providers ont échoué
    throw new Error(`All providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Met à jour l'identité avec le contexte pertinent
   */
  private async updateContextualIdentity(userMessage: string): Promise<void> {
    if (!this.contextEnabled || !this.contextInjector) {
      return;
    }

    try {
      const contextBlock = await this.contextInjector.injectContext(userMessage);
      
      if (contextBlock) {
        this.identity = this.baseIdentity + '\n\n' + contextBlock;
        console.log('[Brain] Context injected into identity');
      } else {
        this.identity = this.baseIdentity;
      }
    } catch (error) {
      console.error('[Brain] Context injection failed:', error);
      this.identity = this.baseIdentity;
    }
  }

  /**
   * Déclenche la compression en arrière-plan
   */
  private triggerCompressionAsync(): void {
    if (!this.contextInjector) return;

    this.contextInjector.maybeCompress()
      .then(compressed => {
        if (compressed) {
          console.log('[Brain] Conversation history compressed');
        }
      })
      .catch(err => console.error('[Brain] Compression error:', err));
  }

  // Continuer après un résultat d'outil
  async continueAfterTool(tools: Tool[], abortSignal?: AbortSignal): Promise<BrainResponse> {
    const cleanedHistory = this.getCleanedHistory();

    const aiTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    }));

    // Utiliser le fallback automatique aussi
    const response = await this.chatWithFallback(cleanedHistory, aiTools, abortSignal);

    this.addAssistantMessage(response.content);

    return {
      content: response.content.map(block => {
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
      usage: response.usage
    };
  }

  // Charger l'historique depuis la mémoire
  loadHistory(): void {
    const memory = getMemory();
    const messages = memory.getMessages();

    this.conversationHistory = [];

    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        // Reconstruire le content avec les images si présentes
        let content: string | AIContentBlock[] = msg.content;

        if (msg.role === 'user' && msg.images && msg.images.length > 0) {
          // Multi-modal: créer un tableau de content blocks
          const contentBlocks: AIContentBlock[] = [{ type: 'text', text: msg.content }];
          for (const img of msg.images) {
            contentBlocks.push({
              type: 'image',
              source: img.source
            } as AIContentBlock);
          }
          content = contentBlocks;
        }

        this.conversationHistory.push({
          role: msg.role,
          content
        });
      }
    }
  }

  // Effacer l'historique
  clearHistory(): void {
    this.conversationHistory = [];
  }

  // Obtenir l'historique actuel
  getHistory(): AIMessage[] {
    return this.conversationHistory;
  }

  // Vérifier si c'est une nouvelle session
  isNewSession(): boolean {
    return this.conversationHistory.length === 0;
  }
}
