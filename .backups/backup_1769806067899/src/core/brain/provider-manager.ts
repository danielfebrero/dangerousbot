/**
 * Provider Manager - Gestion des providers AI avec hot-swap et fallback
 */

import { AIProvider, AIMessage, AIResponse, createProvider, StreamCallback } from '../providers/index.js';
import { MODELS, TOKENS, APIS, PROVIDER, setActiveProvider, ProviderType } from '../../config.js';
import { ApiKeys } from './types.js';

export class ProviderManager {
  private provider: AIProvider;
  private apiKeys: ApiKeys;

  constructor(apiKeys: ApiKeys) {
    this.apiKeys = apiKeys;
    this.provider = this.createCurrentProvider();
    console.log(`[ProviderManager] Initialized with: ${this.provider.name} (${this.provider.model})`);
  }

  /**
   * Crée le provider selon la config actuelle
   */
  private createCurrentProvider(): AIProvider {
    const providerType = PROVIDER.ACTIVE;
    
    if (providerType === 'kimi') {
      const kimiKey = this.apiKeys.kimi || APIS.KIMI_API_KEY;
      if (!kimiKey) {
        console.warn('[ProviderManager] Kimi API key not found, falling back to Claude');
        return this.createClaudeProvider();
      }
      return createProvider({
        provider: 'kimi',
        apiKey: kimiKey,
        model: MODELS.KIMI_DEFAULT,
        maxTokens: TOKENS.MAX_RESPONSE
      });
    }
    
    return this.createClaudeProvider();
  }

  /**
   * Crée un provider Claude
   */
  private createClaudeProvider(): AIProvider {
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
    console.log(`[ProviderManager] Switched to: ${this.provider.name} (${this.provider.model})`);
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
   * Définit la clé API OpenRouter
   */
  setOpenRouterApiKey(apiKey: string): void {
    this.apiKeys.openRouter = apiKey;
  }

  /**
   * Chat avec fallback automatique entre providers
   */
  async chatWithFallback(
    messages: AIMessage[],
    options: {
      system: string;
      tools: { name: string; description: string; input_schema: any }[];
      maxTokens?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<AIResponse> {
    const providers: ProviderType[] = ['claude', 'kimi'];
    const currentProviderName = this.provider.name as ProviderType;
    
    const orderedProviders = [
      currentProviderName,
      ...providers.filter(p => p !== currentProviderName)
    ];

    let lastError: Error | null = null;

    for (const providerName of orderedProviders) {
      try {
        if (providerName !== this.provider.name) {
          console.log(`[ProviderManager] Fallback: switching to ${providerName}`);
          this.switchProvider(providerName);
          
          (global as any).__providerSwitched = {
            from: currentProviderName,
            to: providerName,
            reason: lastError?.message || 'Provider unavailable'
          };
        }

        return await this.provider.chat(messages, {
          system: options.system,
          tools: options.tools,
          maxTokens: options.maxTokens || TOKENS.MAX_RESPONSE,
          abortSignal: options.abortSignal
        });
      } catch (error) {
        lastError = error as Error;
        
        if (this.shouldFallback(lastError)) {
          console.error(`[ProviderManager] Provider ${providerName} failed: ${lastError.message}`);
          continue;
        }

        throw error;
      }
    }

    throw new Error(`All providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Chat en streaming avec fallback automatique
   */
  async chatStreamWithFallback(
    messages: AIMessage[],
    options: {
      system: string;
      tools: { name: string; description: string; input_schema: any }[];
      maxTokens?: number;
      abortSignal?: AbortSignal;
      onChunk?: StreamCallback;
    }
  ): Promise<AIResponse> {
    const providers: ProviderType[] = ['claude', 'kimi'];
    const currentProviderName = this.provider.name as ProviderType;
    
    const orderedProviders = [
      currentProviderName,
      ...providers.filter(p => p !== currentProviderName)
    ];

    let lastError: Error | null = null;

    for (const providerName of orderedProviders) {
      try {
        if (providerName !== this.provider.name) {
          console.log(`[ProviderManager] Fallback: switching to ${providerName}`);
          this.switchProvider(providerName);
          
          (global as any).__providerSwitched = {
            from: currentProviderName,
            to: providerName,
            reason: lastError?.message || 'Provider unavailable'
          };
        }

        return await this.provider.chatStream(messages, {
          system: options.system,
          tools: options.tools,
          maxTokens: options.maxTokens || TOKENS.MAX_RESPONSE,
          abortSignal: options.abortSignal,
          onChunk: options.onChunk || (() => {})
        });
      } catch (error) {
        lastError = error as Error;
        
        if (this.shouldFallback(lastError)) {
          console.error(`[ProviderManager] Provider ${providerName} failed: ${lastError.message}`);
          continue;
        }

        throw error;
      }
    }

    throw new Error(`All providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Détermine si on doit faire un fallback sur ce type d'erreur
   */
  private shouldFallback(error: Error): boolean {
    const errorMsg = error.message.toLowerCase();
    
    return (
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
      errorMsg.includes('unavailable')
    );
  }
}
