/**
 * Tool: switch_provider - Change de provider AI (par thread ou global)
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { setActiveProvider, ProviderType } from '../../config';
import { getThreadManager } from '../thread-manager';

export const switchProviderDefinition: Tool = {
  name: 'switch_provider',
  description: 'Change le provider AI actif (Claude, Kimi ou Mistral). Si appelé dans un thread, le changement est scopé à ce thread uniquement. Sinon, il s\'applique globalement.',
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

    if (context.threadId) {
      // Thread-scoped: persiste dans la DB, pas de mutation globale
      getThreadManager().setThreadProvider(context.threadId, provider);

      (global as any).__pendingProviderSwitch = {
        provider,
        threadId: context.threadId,
        scope: 'thread'
      };

      return {
        success: true,
        message: `Provider du thread changé vers: ${provider}. Ce thread utilisera ${provider} pour les prochains messages.`,
        provider
      };
    }

    // Global: change pour tous les threads sans provider explicite
    setActiveProvider(provider);

    (global as any).__pendingProviderSwitch = {
      provider,
      threadId: null,
      scope: 'global'
    };

    return {
      success: true,
      message: `Provider global changé vers: ${provider}. Les threads sans provider explicite utiliseront ce provider.`,
      provider
    };
  }
};
