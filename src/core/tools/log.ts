/**
 * Tool log - Récupère et filtre les logs du système
 */

import { Tool } from '../types';
import { ToolHandler } from './types';
import { logger, LogLevel, LogEntry } from '../logger';

// ============================================================================
// DEFINITION
// ============================================================================

export const logDefinition: Tool = {
  name: 'log',
  description: `Récupère et filtre les logs du système DangerousBot.

Permet de consulter l'historique des logs avec différents niveaux de détail:
- VERBOSE: Tous les logs (incluant messages history complets)
- DEBUG: Logs de debug détaillés
- INFO: Informations générales (par défaut)
- WARN: Avertissements uniquement
- ERROR: Erreurs uniquement

Utilisez ce tool pour:
- Déboguer des problèmes
- Vérifier les opérations récentes
- Analyser les erreurs
- Consulter l'historique des messages (si level='VERBOSE')`,
  input_schema: {
    type: 'object',
    properties: {
      level: {
        type: 'string',
        enum: ['VERBOSE', 'DEBUG', 'INFO', 'WARN', 'ERROR'],
        description: 'Niveau minimum de log à récupérer. Plus le niveau est bas, plus les logs sont détaillés. Par défaut: INFO'
      },
      count: {
        type: 'number',
        description: 'Nombre maximum de logs à récupérer (des plus récents, entre 1 et 1000). Par défaut: 50'
      },
      module: {
        type: 'string',
        description: 'Filtrer par nom de module (optionnel)'
      },
      search: {
        type: 'string',
        description: 'Rechercher un terme dans les messages (optionnel)'
      }
    },
    required: []
  }
};

// ============================================================================
// HANDLER
// ============================================================================

export const logHandler: ToolHandler = {
  name: 'log',
  definition: logDefinition,

  async execute(input: { level?: LogLevel; count?: number; module?: string; search?: string }): Promise<any> {
    const level = input.level || 'INFO';
    const count = Math.min(Math.max(input.count || 50, 1), 1000);
    const moduleFilter = input.module;
    const searchTerm = input.search;

    try {
      // Récupérer les logs récents
      let logs = logger.getRecentLogs(count * 2, level); // *2 pour avoir de la marge pour les filtres

      // Filtrer par module si spécifié
      if (moduleFilter) {
        logs = logs.filter(log => 
          log.module.toLowerCase().includes(moduleFilter.toLowerCase())
        );
      }

      // Filtrer par terme de recherche si spécifié
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        logs = logs.filter(log => 
          log.message.toLowerCase().includes(searchLower) ||
          (log.data && JSON.stringify(log.data).toLowerCase().includes(searchLower))
        );
      }

      // Limiter au nombre demandé
      logs = logs.slice(-count);

      // Formater les logs pour l'affichage
      const formattedLogs = logs.map(log => ({
        timestamp: log.timestamp,
        level: log.level,
        module: log.module,
        message: log.message,
        data: log.data
      }));

      return {
        success: true,
        data: {
          total: formattedLogs.length,
          level: level,
          logs: formattedLogs,
          currentLogLevel: logger.getLevel(),
          paths: {
            json: logger.getJsonLogPath(),
            text: logger.getTextLogPath()
          }
        },
        message: `${formattedLogs.length} logs récupérés (niveau: ${level})`
      };

    } catch (error) {
      return {
        success: false,
        error: `Erreur lors de la récupération des logs: ${(error as Error).message}`
      };
    }
  }
};

// ============================================================================
// SET LOG LEVEL TOOL
// ============================================================================

export const setLogLevelDefinition: Tool = {
  name: 'set_log_level',
  description: `Change le niveau de logging du système.

Niveaux disponibles (du plus verbeux au moins verbeux):
- VERBOSE: Tout est loggué (incluant les messages history complets)
- DEBUG: Informations de debug détaillées
- INFO: Informations générales (par défaut)
- WARN: Avertissements uniquement
- ERROR: Erreurs uniquement
- SILENT: Rien n'est loggué

Note: Un redémarrage réinitialise le niveau à INFO.`,
  input_schema: {
    type: 'object',
    properties: {
      level: {
        type: 'string',
        enum: ['VERBOSE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'],
        description: 'Nouveau niveau de log'
      }
    },
    required: ['level']
  }
};

export const setLogLevelHandler: ToolHandler = {
  name: 'set_log_level',
  definition: setLogLevelDefinition,

  async execute(input: { level: LogLevel }): Promise<any> {
    const validLevels: LogLevel[] = ['VERBOSE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'];
    
    if (!validLevels.includes(input.level)) {
      return {
        success: false,
        error: `Niveau de log invalide: ${input.level}. Niveaux valides: ${validLevels.join(', ')}`
      };
    }

    const previousLevel = logger.getLevel();
    logger.setLevel(input.level);

    return {
      success: true,
      data: {
        previousLevel,
        currentLevel: input.level
      },
      message: `Niveau de log changé de ${previousLevel} à ${input.level}`
    };
  }
};

// ============================================================================
// CLEAR LOGS TOOL
// ============================================================================

export const clearLogsDefinition: Tool = {
  name: 'clear_logs',
  description: 'Efface tous les fichiers de logs du système. Cette action est irréversible.',
  input_schema: {
    type: 'object',
    properties: {},
    required: []
  }
};

export const clearLogsHandler: ToolHandler = {
  name: 'clear_logs',
  definition: clearLogsDefinition,

  async execute(): Promise<any> {
    try {
      logger.clearLogs();
      return {
        success: true,
        message: 'Tous les logs ont été effacés'
      };
    } catch (error) {
      return {
        success: false,
        error: `Erreur lors de l'effacement des logs: ${(error as Error).message}`
      };
    }
  }
};
