/**
 * Tool: manage_conversations - Gère les conversations avec les IA consultantes
 * 
 * Permet de lister, récupérer et supprimer des conversations persistantes.
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const manageConversationsDefinition: Tool = {
  name: 'manage_conversations',
  description: `Gère les conversations persistantes avec les IA consultantes (Mistral, Grok).

Actions disponibles:
- list: Liste toutes les conversations avec leurs métadonnées
- get: Récupère le détail complet d'une conversation par son ID
- delete: Supprime une conversation spécifique
- clear: Supprime TOUTES les conversations (irréversible)`,
  input_schema: {
    type: 'object',
    properties: {
      action: { 
        type: 'string', 
        enum: ['list', 'get', 'delete', 'clear'],
        description: 'Action à effectuer sur les conversations' 
      },
      conversation_id: { 
        type: 'string', 
        description: 'ID de la conversation (requis pour get et delete)' 
      }
    },
    required: ['action']
  }
};

export const manageConversationsHandler: ToolHandler = {
  name: 'manage_conversations',
  definition: manageConversationsDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    if (!context.aiConsultant) {
      return { 
        success: false, 
        error: 'AI Consultant non configuré' 
      };
    }

    const action = input.action as 'list' | 'get' | 'delete' | 'clear';
    const conversationId = input.conversation_id as string | undefined;

    try {
      switch (action) {
        case 'list': {
          const conversations = context.aiConsultant.listConversations();
          return {
            success: true,
            conversations: conversations.map((c: any) => ({
              id: c.id,
              model: c.model,
              message_count: c.messages.length,
              created_at: c.createdAt,
              updated_at: c.updatedAt,
              metadata: c.metadata,
            })),
            count: conversations.length,
          };
        }

        case 'get': {
          if (!conversationId) {
            return {
              success: false,
              error: 'conversation_id est requis pour l\'action get',
            };
          }
          const conversation = context.aiConsultant.getConversation(conversationId);
          if (!conversation) {
            return {
              success: false,
              error: `Conversation ${conversationId} non trouvée`,
            };
          }
          return {
            success: true,
            conversation: {
              id: conversation.id,
              model: conversation.model,
              messages: conversation.messages,
              created_at: conversation.createdAt,
              updated_at: conversation.updatedAt,
              metadata: conversation.metadata,
            },
          };
        }

        case 'delete': {
          if (!conversationId) {
            return {
              success: false,
              error: 'conversation_id est requis pour l\'action delete',
            };
          }
          const deleted = context.aiConsultant.deleteConversation(conversationId);
          if (deleted) {
            return {
              success: true,
              message: `Conversation ${conversationId} supprimée`,
            };
          } else {
            return {
              success: false,
              error: `Conversation ${conversationId} non trouvée`,
            };
          }
        }

        case 'clear': {
          context.aiConsultant.clearConversations();
          return {
            success: true,
            message: 'Toutes les conversations ont été supprimées',
          };
        }

        default:
          return {
            success: false,
            error: `Action inconnue: ${action}`,
          };
      }
    } catch (error) {
      return { 
        success: false, 
        error: `Erreur gestion conversations: ${(error as Error).message}` 
      };
    }
  }
};
