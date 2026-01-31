/**
 * Tool: config - Gestion dynamique de la configuration
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { configService } from '../services/config';

export const configDefinition: Tool = {
  name: 'config',
  description: `Gère la configuration dynamique du système.

Permet de lire et modifier les paramètres de configuration stockés en base de données.

Actions disponibles:
- get: Récupère une valeur de configuration
- set: Définit une valeur de configuration  
- list: Liste toutes les configurations
- delete: Supprime une configuration

Configuration spéciale 'storage_limit_gb':
- Définit la limite de stockage pour les fichiers téléchargés
- Valeur par défaut: 1 (1 GB)
- Exemple: config({ action: 'set', key: 'storage_limit_gb', value: '2' })`,
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'set', 'list', 'delete'],
        description: 'Action à effectuer'
      },
      key: {
        type: 'string',
        description: 'Clé de configuration (requis pour get/set/delete)'
      },
      value: {
        type: 'string',
        description: 'Valeur à définir (requis pour set)'
      }
    },
    required: ['action']
  }
};

export const configHandler: ToolHandler = {
  name: 'config',
  definition: configDefinition,

  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const action = input.action as string;

    try {
      switch (action) {
        case 'get': {
          const key = input.key as string;
          if (!key) {
            return { success: false, error: 'Clé requise pour l\'action get' };
          }
          const value = await configService.get(key);
          return {
            success: true,
            data: { key, value },
            message: value !== undefined ? `${key} = ${value}` : `Clé '${key}' non définie`
          };
        }

        case 'set': {
          const key = input.key as string;
          const value = input.value as string;
          if (!key || value === undefined) {
            return { success: false, error: 'Clé et valeur requises pour l\'action set' };
          }
          
          // Si c'est storage_limit_gb, mettre à jour aussi storage_limit_bytes
          if (key === 'storage_limit_gb') {
            const gb = parseFloat(value);
            if (isNaN(gb) || gb <= 0) {
              return { success: false, error: 'Valeur invalide pour storage_limit_gb' };
            }
            await configService.setStorageLimitGB(gb);
            return {
              success: true,
              data: { key, value, bytes: gb * 1024 * 1024 * 1024 },
              message: `Limite de stockage définie à ${gb} GB (${gb * 1024 * 1024 * 1024} bytes)`
            };
          }
          
          await configService.set(key, value);
          return {
            success: true,
            data: { key, value },
            message: `${key} = ${value}`
          };
        }

        case 'list': {
          const allConfig = await configService.getAll();
          return {
            success: true,
            data: allConfig,
            message: `${Object.keys(allConfig).length} configuration(s) trouvée(s)`
          };
        }

        case 'delete': {
          const key = input.key as string;
          if (!key) {
            return { success: false, error: 'Clé requise pour l\'action delete' };
          }
          await configService.delete(key);
          return {
            success: true,
            message: `Configuration '${key}' supprimée`
          };
        }

        default:
          return { success: false, error: `Action inconnue: ${action}` };
      }
    } catch (error) {
      return {
        success: false,
        error: `Erreur config: ${(error as Error).message}`
      };
    }
  }
};
