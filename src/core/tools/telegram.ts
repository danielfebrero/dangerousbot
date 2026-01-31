/**
 * Tool telegram - Gestion du master user Telegram
 * 
 * Permet de définir qui est le "maître" autorisé à interagir avec le bot Telegram.
 * Un seul utilisateur possible : le maître unique.
 */

import { Tool, ToolContext, ToolHandler } from './types';
import { ToolInput, ToolResult } from '../types.js';
import { getMemory } from '../memory';

export interface TelegramInput {
  command: 'set_master_user';
  param: string;
}

export const telegramDefinition: Tool = {
  name: 'telegram',
  description: 'Gère l\'utilisateur maître Telegram. Un seul maître autorisé à interagir avec le bot.\nUsage: telegram(set_master_user, "username") ou telegram(set_master_user, "123456789") pour un ID numérique.',
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: ['set_master_user'],
        description: 'Commande à effectuer'
      },
      param: {
        type: 'string',
        description: 'Username Telegram (sans @) ou ID numérique de l\'utilisateur maître'
      }
    },
    required: ['command', 'param']
  }
};

export const telegramHandler: ToolHandler = {
  name: 'telegram',
  definition: telegramDefinition,
  
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const { command, param } = input;
    
    if (command === 'set_master_user') {
      return await setMasterUser(param as string, context);
    }
    
    throw new Error(`Action inconnue: ${command}`);
  }
};

async function setMasterUser(usernameOrId: string, context: ToolContext): Promise<ToolResult> {
  const memory = getMemory();
  
  // Détecter si c'est un ID numérique ou un username
  const numericId = parseInt(usernameOrId, 10);
  const isNumeric = !isNaN(numericId) && numericId.toString() === usernameOrId;
  
  if (isNumeric) {
    // C'est un ID numérique
    memory.setTelegramMaster(numericId, null);
    console.log(`[Telegram] Master user défini par ID: ${numericId}`);
    return {
      success: true,
      message: `Master user défini avec l'ID: ${numericId}`,
      user_id: numericId,
      username: null
    };
  } else {
    // C'est un username
    const cleanUsername = usernameOrId.replace(/^@/, '').toLowerCase();
    memory.setTelegramMaster(null, cleanUsername);
    console.log(`[Telegram] Master user défini par username: @${cleanUsername}`);
    return {
      success: true,
      message: `Master user défini avec le username: @${cleanUsername}`,
      user_id: null,
      username: cleanUsername
    };
  }
}
