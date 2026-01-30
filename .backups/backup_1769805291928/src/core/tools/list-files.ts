/**
 * Tool: list_files - Liste les fichiers d'un répertoire
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const listFilesDefinition: Tool = {
  name: 'list_files',
  description: 'Liste les fichiers et dossiers dans un répertoire.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Chemin du répertoire' }
    },
    required: ['path']
  }
};

export const listFilesHandler: ToolHandler = {
  name: 'list_files',
  definition: listFilesDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const dirPath = input.path as string;
    return context.executor.listFiles(dirPath);
  }
};
