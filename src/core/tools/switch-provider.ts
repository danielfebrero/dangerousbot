/**
 * Tool: switch_provider - Change de provider AI
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { setActiveProvider, ProviderType } from '../../config';

export const switchProviderDefinition: Tool = {
  name: 'switch_provider',
  description: 'Change le provider AI actif (Claude, Kimi ou Mistral). Le changement prend effet immédiatement pour le prochain message.',
  input_schema: {
    type: 'object',
    properties: {
      provider: {
        type: 'string',
        description: 'Le provider à utiliser',
        enum: ['claude', 'kimi', 'mistral']
      }
    },
    required: ['provider']
  }
};

export const switchProviderHandler: ToolHandler = {
  name: 'switch_provider',
  definition: switchProviderDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const provider = input.provider as ProviderType;

    // Valider le provider
    if (provider !== 'claude' && provider !== 'kimi' && provider !== 'mistral') {
      return { success: false, error: `Provider inconnu: ${provider}. Utilise 'claude', 'kimi' ou 'mistral'.` };
    }

    // Changer le provider dans la config
    setActiveProvider(provider);

    // Stocker le flag
    (global as any).__pendingProviderSwitch = provider;

    return {
      success: true,
      message: `Provider changé vers: ${provider}. Le prochain message utilisera ce provider.`,
      provider
    };
  }
};
