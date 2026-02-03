/**
 * Tool: compact - Compresse la conversation en un résumé
 *
 * Permet au LLM de compresser manuellement la conversation lorsque
 * le contexte devient trop long ou sur demande de l'utilisateur.
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { getCompressor } from '../compressor';

export const compactDefinition: Tool = {
  name: 'compact',
  description: `Compresse toute la conversation en un résumé concis et libère le contexte.
Utilise cet outil quand:
- Le contexte devient trop long (proche de 128K tokens)
- L'utilisateur demande explicitement de résumer/compresser
- Tu veux libérer de l'espace contexte pour une nouvelle tâche

Le résumé conserve les décisions prises, informations clés et contexte important.
Par défaut, les messages originaux sont supprimés pour libérer le contexte (utilise clear_originals=false pour les conserver).`,
  input_schema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Raison de la compression (optionnel, pour le log)'
      },
      clear_originals: {
        type: 'boolean',
        description: 'Si false, conserve les messages originaux après compression (défaut: true - supprime les originaux pour libérer le contexte)'
      },
      thread_id: {
        type: 'string',
        description: 'ID du thread à compresser (optionnel, défaut: thread courant)'
      }
    },
    required: []
  }
};

export const compactHandler: ToolHandler = {
  name: 'compact',
  definition: compactDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const reason = input.reason as string | undefined;
    const clearOriginals = input.clear_originals as boolean | undefined;

    const compressor = getCompressor();
    if (!compressor) {
      return {
        success: false,
        error: 'Compressor non initialisé. Le système de compression n\'est pas disponible.'
      };
    }

    try {
      // Utiliser thread_id de l'input si fourni, sinon celui du contexte
      const targetThreadId = (input.thread_id as string | undefined) || context.threadId;

      // Compresser le thread spécifié (sessionId = undefined pour utiliser la session courante)
      const result = await compressor.compressSession(undefined, targetThreadId);

      if (!result) {
        return {
          success: true,
          message: 'Aucun message à compresser dans la session courante.'
        };
      }

      // Par défaut, supprimer les messages originaux pour libérer le contexte
      // Sauf si explicitement demandé de les garder (clearOriginals === false)
      const shouldClear = clearOriginals !== false;
      let clearedCount = 0;
      if (shouldClear) {
        clearedCount = compressor.clearCompressedMessages(undefined, targetThreadId);
      }

      return {
        success: true,
        message: `Conversation compressée avec succès.`,
        details: {
          messagesCompressed: result.message_ids.length,
          summaryLength: result.summary.length,
          timeRange: `${result.start_time} → ${result.end_time}`,
          messagesCleared: clearedCount,
          reason: reason || 'non spécifiée'
        },
        summary: result.summary.substring(0, 500) + (result.summary.length > 500 ? '...' : '')
      };
    } catch (error) {
      return {
        success: false,
        error: `Échec de la compression: ${(error as Error).message}`
      };
    }
  }
};
