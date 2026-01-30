/**
 * Tool: remember - Sauvegarde dans la mémoire long terme
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const rememberDefinition: Tool = {
  name: 'remember',
  description: 'Sauvegarde une information importante dans la mémoire long-terme.',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Type d\'information',
        enum: ['fact', 'preference', 'context', 'skill']
      },
      content: { type: 'string', description: 'L\'information à retenir' }
    },
    required: ['type', 'content']
  }
};

export const rememberHandler: ToolHandler = {
  name: 'remember',
  definition: rememberDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const type = input.type as 'fact' | 'preference' | 'context' | 'skill';
    const content = input.content as string;
    const id = context.memory.addKnowledge(type, content);
    return { success: true, id, message: `Information mémorisée (${type})` };
  }
};
