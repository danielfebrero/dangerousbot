/**
 * Tool: restart_server - Redémarre le serveur
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const restartServerDefinition: Tool = {
  name: 'restart_server',
  description: 'Redémarre le serveur DangerousBot. Utilise après des modifications de code.',
  input_schema: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Raison du redémarrage' }
    },
    required: []
  }
};

export const restartServerHandler: ToolHandler = {
  name: 'restart_server',
  definition: restartServerDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const reason = (input.reason as string) || 'Demandé par le bot';
    
    // Marquer le redémarrage dans le système de lifecycle avec le threadId
    const { Lifecycle } = await import('../lifecycle.js');
    const lifecycle = new Lifecycle(process.cwd());
    const threadId = context.threadId;
    lifecycle.markRestarted(reason, threadId);

    // Stocker le flag pour que le serveur gère le timing
    (global as any).__pendingRestart = { reason, threadId };

    return {
      success: true,
      message: `Redémarrage programmé: ${reason}. Le serveur va terminer la réponse puis redémarrer.`,
      needsRestart: true
    };
  }
};
