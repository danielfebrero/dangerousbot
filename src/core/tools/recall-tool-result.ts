/**
 * Tool: recall_tool_result - Récupère le résultat complet d'une exécution de tool passée
 *
 * Permet à l'agent de retrouver les résultats d'exécutions passées après un redémarrage,
 * en utilisant l'ID de référence fourni dans le résumé du contexte.
 */

import { Tool, ToolResult, ToolInput } from '../types.js';
import { ToolHandler, ToolContext } from './types.js';
import { getToolResultStore } from '../tool-result-store.js';

export const recallToolResultDefinition: Tool = {
  name: 'recall_tool_result',
  description: `Récupère le résultat complet d'une exécution de tool passée.
Utilise l'ID de référence fourni dans les résumés du contexte (format: [ID: xxx]).
Utile pour retrouver des résultats volumineux (fichiers, outputs de commandes) après un redémarrage.`,
  input_schema: {
    type: 'object',
    properties: {
      tool_call_id: {
        type: 'string',
        description: 'ID unique de l\'exécution de tool (ex: exec-1706950500-abc123)'
      },
      format: {
        type: 'string',
        enum: ['full', 'summary'],
        description: 'Format de retour: "full" (défaut) pour le résultat complet, "summary" pour un résumé'
      }
    },
    required: ['tool_call_id']
  }
};

export const recallToolResultHandler: ToolHandler = {
  name: 'recall_tool_result',
  definition: recallToolResultDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const toolCallId = input.tool_call_id as string;
    const format = (input.format as 'full' | 'summary') || 'full';

    if (!toolCallId) {
      return {
        success: false,
        error: 'tool_call_id est requis'
      };
    }

    const store = getToolResultStore();
    const execution = store.getToolExecution(toolCallId);

    if (!execution) {
      return {
        success: false,
        error: `Aucune exécution trouvée avec l'ID: ${toolCallId}. Note: seules les exécutions récentes (< 30 jours) sont conservées.`
      };
    }

    if (format === 'summary') {
      return {
        success: true,
        summary: store.formatToolSummary(execution),
        toolName: execution.toolName,
        executedAt: execution.timestamp,
        status: execution.status
      };
    }

    // Format complet
    return {
      success: true,
      toolName: execution.toolName,
      executedAt: execution.timestamp,
      status: execution.status,
      input: execution.input,
      output: execution.output,
      error: execution.error,
      executionTimeMs: execution.metadata.executionTimeMs
    };
  }
};
