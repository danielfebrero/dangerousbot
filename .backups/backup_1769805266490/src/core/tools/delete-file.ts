/**
 * Tool: delete_file - Supprime un fichier
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const deleteFileDefinition: Tool = {
  name: 'delete_file',
  description: 'Supprime un fichier.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Chemin du fichier à supprimer' }
    },
    required: ['path']
  }
};

export const deleteFileHandler: ToolHandler = {
  name: 'delete_file',
  definition: deleteFileDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = input.path as string;
    return context.executor.deleteFile(filePath);
  }
};
