/**
 * Tool: write_file - Écrit dans un fichier
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const writeFileDefinition: Tool = {
  name: 'write_file',
  description: 'Écrit du contenu dans un fichier. Crée le fichier et les répertoires parents si nécessaire.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Chemin du fichier' },
      content: { type: 'string', description: 'Contenu à écrire' }
    },
    required: ['path', 'content']
  }
};

export const writeFileHandler: ToolHandler = {
  name: 'write_file',
  definition: writeFileDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = input.path as string;
    const content = input.content as string;
    return context.executor.writeFile(filePath, content);
  }
};
