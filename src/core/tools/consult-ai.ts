/**
 * Tool: consult_ai - Consulte un modèle IA (Mistral, Grok) pour obtenir un second avis
 * 
 * Supporte le multi-turn avec historique de conversation persistant.
 * Les modèles disponibles:
 * - mistral: Mistral AI (Large/Medium/Small selon complexité)
 * - grok: xAI Grok (4-1-fast-reasoning pour high/medium, 4-1-fast-non-reasoning pour low)
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const consultAIDefinition: Tool = {
  name: 'consult_ai',
  description: `Consulte un modèle IA (Mistral ou Grok) pour obtenir un second avis, brainstormer, ou déléguer une tâche.

Modèles disponibles:
- mistral: Sélection automatique (Large=high, Medium=medium, Small=low)
- grok: grok-4-1-fast-reasoning (high/medium) ou grok-4-1-fast-non-reasoning (low)

Supporte le multi-turn: utilisez conversation_id pour continuer une conversation existante.
Si conversation_id n'est pas fourni, une nouvelle conversation sera créée automatiquement.`,
  input_schema: {
    type: 'object',
    properties: {
      query: { 
        type: 'string', 
        description: 'La question ou tâche à soumettre au modèle IA' 
      },
      model: { 
        type: 'string', 
        enum: ['mistral', 'grok'], 
        description: 'Modèle IA à consulter (défaut: mistral)' 
      },
      complexity: { 
        type: 'string', 
        enum: ['low', 'medium', 'high', 'auto'], 
        description: 'Complexité de la tâche (auto = sélection automatique)' 
      },
      context: { 
        type: 'string', 
        description: 'Contexte additionnel pour la requête' 
      },
      conversation_id: { 
        type: 'string', 
        description: 'ID de conversation existante pour continuer un échange (optionnel)' 
      },
      system_prompt: { 
        type: 'string', 
        description: 'System prompt personnalisé (optionnel)' 
      }
    },
    required: ['query']
  }
};

export const consultAIHandler: ToolHandler = {
  name: 'consult_ai',
  definition: consultAIDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    if (!context.aiConsultant) {
      return { 
        success: false, 
        error: 'AI Consultant non configuré. Vérifiez que les clés API Mistral et/ou Grok sont configurées.' 
      };
    }

    const query = input.query as string;
    const model = (input.model as 'mistral' | 'grok') || 'mistral';
    const complexity = (input.complexity as 'low' | 'medium' | 'high' | 'auto') || 'auto';
    const ctx = input.context as string | undefined;
    const conversationId = input.conversation_id as string | undefined;
    const systemPrompt = input.system_prompt as string | undefined;

    try {
      const result = await context.aiConsultant.consult({
        query,
        model,
        complexity,
        context: ctx,
        conversationId,
        systemPrompt,
      });

      return {
        success: true,
        response: result.response,
        model: result.model,
        model_size: result.modelSize,
        reasoning: result.reasoning,
        conversation_id: result.conversationId,
        usage: result.usage,
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Erreur AI consultation: ${(error as Error).message}` 
      };
    }
  }
};
