/**
 * Tool: wait - Attend un nombre de secondes spécifié
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

const MAX_WAIT_SECONDS = 300; // 5 minutes max

export const waitDefinition: Tool = {
  name: 'wait',
  description: `Attend un nombre de secondes spécifié avant de continuer. Utile pour créer des pauses entre des actions. Maximum ${MAX_WAIT_SECONDS} secondes.`,
  input_schema: {
    type: 'object',
    properties: {
      seconds: {
        type: 'number',
        description: 'Nombre de secondes à attendre',
        minimum: 0,
        maximum: MAX_WAIT_SECONDS
      }
    },
    required: ['seconds']
  }
};

export const waitHandler: ToolHandler = {
  name: 'wait',
  definition: waitDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const seconds = input.seconds as number;

    if (typeof seconds !== 'number' || isNaN(seconds)) {
      return { success: false, error: 'Le paramètre "seconds" doit être un nombre valide.' };
    }

    if (seconds < 0) {
      return { success: false, error: 'Le nombre de secondes ne peut pas être négatif.' };
    }

    if (seconds > MAX_WAIT_SECONDS) {
      return { success: false, error: `Le temps d'attente maximum est de ${MAX_WAIT_SECONDS} secondes.` };
    }

    const ms = Math.round(seconds * 1000);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);

      if (context.abortSignal) {
        if (context.abortSignal.aborted) {
          clearTimeout(timer);
          reject(new Error('Attente annulée.'));
          return;
        }
        context.abortSignal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Attente annulée.'));
        }, { once: true });
      }
    });

    return {
      success: true,
      waited: seconds,
      message: `Attente de ${seconds} seconde${seconds !== 1 ? 's' : ''} terminée.`
    };
  }
};
