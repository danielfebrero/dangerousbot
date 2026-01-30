/**
 * Tool: edit_file - Modifie un fichier existant
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const editFileDefinition: Tool = {
  name: 'edit_file',
  description: 'Modifie un fichier existant en remplaçant une chaîne par une autre.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Chemin du fichier à modifier' },
      old_string: { type: 'string', description: 'La chaîne à rechercher' },
      new_string: { type: 'string', description: 'La chaîne de remplacement' },
      replace_all: { type: 'boolean', description: 'true pour remplacer toutes les occurrences' }
    },
    required: ['path', 'old_string', 'new_string']
  }
};

export const editFileHandler: ToolHandler = {
  name: 'edit_file',
  definition: editFileDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = input.path as string;
    const oldString = input.old_string as string;
    const newString = input.new_string as string;
    const replaceAll = input.replace_all as boolean || false;
    return context.executor.editFile(filePath, oldString, newString, replaceAll);
  }
};
