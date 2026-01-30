/**
 * Tool: recall - Récupère de la mémoire long terme
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const recallDefinition: Tool = {
  name: 'recall',
  description: 'Récupère des informations de la mémoire long-terme.',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Type d\'information à récupérer (optionnel)',
        enum: ['fact', 'preference', 'context', 'skill']
      }
    },
    required: []
  }
};

export const recallHandler: ToolHandler = {
  name: 'recall',
  definition: recallDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const type = input.type as 'fact' | 'preference' | 'context' | 'skill' | undefined;
    const knowledge = context.memory.getKnowledge(type);
    return { success: true, knowledge };
  }
};
