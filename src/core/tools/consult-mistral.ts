/**
 * Tool: consult_mistral - Consulte un modèle Mistral
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { checkCancellation } from '../tool-cancellation';

export const consultMistralDefinition: Tool = {
  name: 'consult_mistral',
  description: 'Consulte un modèle Mistral pour obtenir un second avis, brainstormer, ou déléguer une tâche. Les modèles disponibles sont automatiquement sélectionnés selon la complexité: HIGH (Mistral Large 3): architecture, sécurité, décisions critiques, code review complexe; MEDIUM (Mistral Medium 3.1): brainstorming, validation d\'idées, questions générales; LOW (Mistral Small 3.2): tâches rapides, formatting, génération de données.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'La question ou tâche à soumettre à Mistral' },
      complexity: { type: 'string', enum: ['low', 'medium', 'high', 'auto'], description: 'Complexité de la tâche' },
      context: { type: 'string', description: 'Contexte additionnel' },
      force_model: { type: 'string', enum: ['large', 'medium', 'small'], description: 'Forcer un modèle spécifique' }
    },
    required: ['query']
  }
};

export const consultMistralHandler: ToolHandler = {
  name: 'consult_mistral',
  definition: consultMistralDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const signal = context.abortSignal;

    checkCancellation(signal);

    if (!context.mistral) {
      return { success: false, error: 'Mistral API non configurée' };
    }

    const query = input.query as string;
    const ctx = input.context as string | undefined;
    const complexity = input.complexity as 'low' | 'medium' | 'high' | 'auto' | undefined;
    const forceModel = input.force_model as 'large' | 'medium' | 'small' | undefined;

    checkCancellation(signal);

    try {
      const result = await context.mistral.consult({
        query,
        context: ctx,
        complexity,
        forceModel
      });

      return {
        success: true,
        response: result.response,
        model_used: result.model,
        reasoning: result.reasoning,
        tokens: result.usage
      };
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Détecter si c'est une annulation
      if (errorMessage.includes('cancelled') || errorMessage.includes('abort')) {
        return {
          success: false,
          cancelled: true,
          error: 'Consultation Mistral annulée par l\'utilisateur'
        };
      }

      return { success: false, error: `Erreur Mistral: ${errorMessage}` };
    }
  }
};
