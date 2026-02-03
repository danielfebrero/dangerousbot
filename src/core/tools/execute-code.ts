/**
 * Tool: execute_code - Exécute du JavaScript
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const executeCodeDefinition: Tool = {
  name: 'execute_code',
  description: 'Exécute du code JavaScript. Par défaut en mémoire (sandboxé). Si in_memory=false, crée un fichier temporaire.',
  input_schema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Le code JavaScript à exécuter' },
      in_memory: { type: 'boolean', description: 'true (défaut) pour exécuter en mémoire, false pour fichier temporaire' },
      filename: { type: 'string', description: 'Nom du fichier si in_memory=false' }
    },
    required: ['code']
  }
};

export const executeCodeHandler: ToolHandler = {
  name: 'execute_code',
  definition: executeCodeDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const code = input.code as string;
    const inMemory = input.in_memory !== false;
    const signal = context.abortSignal;

    if (inMemory) {
      // L'exécution en mémoire (vm.runInNewContext) ne supporte pas AbortSignal
      // car elle s'exécute dans le même processus
      return await context.executor.executeInMemory(code);
    } else {
      const filename = (input.filename as string) || 'temp.js';
      const result = await context.executor.executeFile(code, filename, 'node', { signal });

      // Détecter si c'est une annulation
      if (!result.success && result.error?.includes('annulée')) {
        return {
          success: false,
          cancelled: true,
          error: 'Exécution du code annulée par l\'utilisateur'
        };
      }

      return result;
    }
  }
};
