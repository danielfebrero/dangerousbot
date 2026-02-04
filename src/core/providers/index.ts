/**
 * Provider Factory - Crée le provider approprié selon la config
 */

import { AIProvider, AIProviderConfig } from './types.js';
import { ClaudeProvider } from './claude.js';
import { KimiProvider } from './kimi.js';
import { MistralProvider } from './mistral.js';
import { GrokProvider } from './grok.js';

export type ProviderType = 'claude' | 'kimi' | 'mistral' | 'grok';

export interface ProviderFactoryConfig {
  provider: ProviderType;
  apiKey: string;
  model: string;
  maxTokens?: number;
}

/**
 * Crée une instance du provider approprié
 */
export function createProvider(config: ProviderFactoryConfig): AIProvider {
  const providerConfig: AIProviderConfig = {
    apiKey: config.apiKey,
    model: config.model,
    maxTokens: config.maxTokens
  };

  switch (config.provider) {
    case 'claude':
      return new ClaudeProvider(providerConfig);
    
    case 'kimi':
      return new KimiProvider(providerConfig);
    
    case 'mistral':
      return new MistralProvider(providerConfig);

    case 'grok':
      return new GrokProvider(providerConfig);

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

// Re-export des types
export * from './types.js';
export { ClaudeProvider } from './claude.js';
export { KimiProvider } from './kimi.js';
export { MistralProvider } from './mistral.js';
export { GrokProvider } from './grok.js';
export { BaseProvider } from './base-provider.js';
