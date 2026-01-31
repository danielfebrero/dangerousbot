/**
 * Logger avancé pour DangerousBot
 * 
 * Niveaux de log (du plus verbeux au moins verbeux):
 * - VERBOSE: Tout (incluant les messages history)
 * - DEBUG: Informations de debug détaillées
 * - INFO: Informations générales (par défaut)
 * - WARN: Avertissements uniquement
 * - ERROR: Erreurs uniquement
 * - SILENT: Rien
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// CONFIGURATION
// ============================================================================

export type LogLevel = 'VERBOSE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';

// Ordre des niveaux (plus le nombre est petit, plus c'est verbeux)
const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  VERBOSE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  SILENT: 5
};

// Niveau par défaut
let CURRENT_LOG_LEVEL: LogLevel = 'INFO';

// ============================================================================
// CHEMINS
// ============================================================================

const LOG_DIR = path.join(process.cwd(), 'logs');
const JSON_LOG_FILE = path.join(LOG_DIR, 'dangerousbot.jsonl');
const TEXT_LOG_FILE = path.join(LOG_DIR, 'dangerousbot.log');

// Créer le dossier si nécessaire
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ============================================================================
// STRUCTURE DES LOGS JSON
// ============================================================================

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  meta?: {
    file?: string;
    line?: number;
    function?: string;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Vérifie si un niveau de log doit être affiché selon le niveau actuel
 */
function shouldLog(level: LogLevel): boolean {
  if (CURRENT_LOG_LEVEL === 'SILENT') return false;
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[CURRENT_LOG_LEVEL];
}

/**
 * Formate un message pour la console
 */
function formatConsoleMessage(level: LogLevel, module: string, message: string): string {
  const timestamp = new Date().toISOString();
  const colors: Record<LogLevel, string> = {
    VERBOSE: '\x1b[90m', // Gray
    DEBUG: '\x1b[36m',   // Cyan
    INFO: '\x1b[32m',    // Green
    WARN: '\x1b[33m',    // Yellow
    ERROR: '\x1b[31m',   // Red
    SILENT: ''
  };
  const reset = '\x1b[0m';
  const color = colors[level] || '';
  return `${color}[${timestamp}] [${level}] [${module}] ${message}${reset}`;
}

/**
 * Crée une entrée de log JSON
 */
function createLogEntry(level: LogLevel, module: string, message: string, data?: unknown): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    data: data !== undefined ? data : undefined
  };
}

/**
 * Écrit une entrée dans le fichier JSON
 */
function writeJsonLog(entry: LogEntry): void {
  try {
    fs.appendFileSync(JSON_LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    // Ignore file errors
  }
}

/**
 * Écrit une entrée dans le fichier texte (fallback)
 */
function writeTextLog(entry: LogEntry): void {
  try {
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    const line = `[${entry.timestamp}] [${entry.level}] [${entry.module}] ${entry.message}${dataStr}\n`;
    fs.appendFileSync(TEXT_LOG_FILE, line);
  } catch (e) {
    // Ignore file errors
  }
}

// ============================================================================
// LOGGER PRINCIPAL
// ============================================================================

export const logger = {
  /**
   * Change le niveau de log actuel
   */
  setLevel(level: LogLevel): void {
    CURRENT_LOG_LEVEL = level;
    this.info('Logger', `Log level changed to: ${level}`);
  },

  /**
   * Récupère le niveau de log actuel
   */
  getLevel(): LogLevel {
    return CURRENT_LOG_LEVEL;
  },

  /**
   * Log VERBOSE - Très verbeux (messages history, etc.)
   */
  verbose(module: string, message: string, data?: unknown): void {
    if (!shouldLog('VERBOSE')) return;
    const entry = createLogEntry('VERBOSE', module, message, data);
    console.log(formatConsoleMessage('VERBOSE', module, message));
    writeJsonLog(entry);
  },

  /**
   * Log DEBUG
   */
  debug(module: string, message: string, data?: unknown): void {
    if (!shouldLog('DEBUG')) return;
    const entry = createLogEntry('DEBUG', module, message, data);
    console.log(formatConsoleMessage('DEBUG', module, message));
    writeJsonLog(entry);
  },

  /**
   * Log INFO (par défaut)
   */
  info(module: string, message: string, data?: unknown): void {
    if (!shouldLog('INFO')) return;
    const entry = createLogEntry('INFO', module, message, data);
    console.log(formatConsoleMessage('INFO', module, message));
    writeJsonLog(entry);
    writeTextLog(entry); // Also write to text for easy reading
  },

  /**
   * Log WARN
   */
  warn(module: string, message: string, data?: unknown): void {
    if (!shouldLog('WARN')) return;
    const entry = createLogEntry('WARN', module, message, data);
    console.log(formatConsoleMessage('WARN', module, message));
    writeJsonLog(entry);
    writeTextLog(entry);
  },

  /**
   * Log ERROR
   */
  error(module: string, message: string, data?: unknown): void {
    if (!shouldLog('ERROR')) return;
    const entry = createLogEntry('ERROR', module, message, data);
    console.error(formatConsoleMessage('ERROR', module, message));
    writeJsonLog(entry);
    writeTextLog(entry);
  },

  /**
   * Récupère le chemin du fichier de log JSON
   */
  getJsonLogPath(): string {
    return JSON_LOG_FILE;
  },

  /**
   * Récupère le chemin du fichier de log texte
   */
  getTextLogPath(): string {
    return TEXT_LOG_FILE;
  },

  /**
   * Récupère les logs récents (pour l'outil log tool)
   */
  getRecentLogs(count: number = 100, level?: LogLevel): LogEntry[] {
    try {
      if (!fs.existsSync(JSON_LOG_FILE)) return [];
      
      const content = fs.readFileSync(JSON_LOG_FILE, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      const entries: LogEntry[] = [];
      
      for (const line of lines.slice(-count)) {
        try {
          const entry = JSON.parse(line) as LogEntry;
          if (!level || LOG_LEVEL_ORDER[entry.level] >= LOG_LEVEL_ORDER[level]) {
            entries.push(entry);
          }
        } catch {
          // Skip malformed lines
        }
      }
      
      return entries;
    } catch (e) {
      return [];
    }
  },

  /**
   * Efface tous les logs
   */
  clearLogs(): void {
    try {
      if (fs.existsSync(JSON_LOG_FILE)) {
        fs.unlinkSync(JSON_LOG_FILE);
      }
      if (fs.existsSync(TEXT_LOG_FILE)) {
        fs.unlinkSync(TEXT_LOG_FILE);
      }
      this.info('Logger', 'All logs cleared');
    } catch (e) {
      console.error('Failed to clear logs:', e);
    }
  }
};

// ============================================================================
// INTERCEPTION DES CONSOLE.*
// ============================================================================

const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug
};

/**
 * Active l'interception des console.* pour les écrire dans les fichiers JSON
 */
export function enableConsoleCapture(): void {
  console.log = (...args: any[]) => {
    originalConsole.log(...args);
    // Forward to logger as DEBUG if log level allows
    if (shouldLog('DEBUG')) {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      const entry = createLogEntry('DEBUG', 'Console', message);
      writeJsonLog(entry);
    }
  };

  console.info = (...args: any[]) => {
    originalConsole.info(...args);
    if (shouldLog('INFO')) {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      const entry = createLogEntry('INFO', 'Console', message);
      writeJsonLog(entry);
    }
  };

  console.warn = (...args: any[]) => {
    originalConsole.warn(...args);
    if (shouldLog('WARN')) {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      const entry = createLogEntry('WARN', 'Console', message);
      writeJsonLog(entry);
    }
  };

  console.error = (...args: any[]) => {
    originalConsole.error(...args);
    if (shouldLog('ERROR')) {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      const entry = createLogEntry('ERROR', 'Console', message);
      writeJsonLog(entry);
    }
  };

  console.debug = (...args: any[]) => {
    originalConsole.debug(...args);
    if (shouldLog('DEBUG')) {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      const entry = createLogEntry('DEBUG', 'Console', message);
      writeJsonLog(entry);
    }
  };
}

/**
 * Désactive l'interception des console.*
 */
export function disableConsoleCapture(): void {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
}

// Activer par défaut
enableConsoleCapture();

export default logger;
export { CURRENT_LOG_LEVEL, LOG_LEVEL_ORDER, LogEntry };
