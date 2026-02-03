/**
 * Tool: shell - Exécute une commande shell
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const shellDefinition: Tool = {
  name: 'shell',
  description: 'Exécute une commande shell. Utilise pour git, npm, ou toute autre commande système.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'La commande à exécuter' },
      cwd: { type: 'string', description: 'Répertoire de travail (optionnel)' }
    },
    required: ['command']
  }
};

export const shellHandler: ToolHandler = {
  name: 'shell',
  definition: shellDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const command = input.command as string;
    const cwd = input.cwd as string | undefined;
    const signal = context.abortSignal;

    const result = await context.executor.shell(command, { cwd, signal });

    // Détecter si c'est une annulation
    if (!result.success && result.error?.includes('annulée')) {
      return {
        success: false,
        cancelled: true,
        error: 'Commande shell annulée par l\'utilisateur'
      };
    }

    return result;
  }
};
