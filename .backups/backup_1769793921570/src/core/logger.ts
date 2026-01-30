/**
 * Logger simple pour DangerousBot
 * Écrit dans la console et dans un fichier
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOG_DIR = path.join(os.homedir(), '.dangerousbot', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'dangerousbot.log');

// Créer le dossier si nécessaire
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function formatMessage(level: LogLevel, module: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level}] [${module}] ${message}${dataStr}`;
}

function writeLog(formatted: string): void {
  // Console
  console.log(formatted);
  
  // Fichier (append)
  try {
    fs.appendFileSync(LOG_FILE, formatted + '\n');
  } catch (e) {
    // Ignore file errors
  }
}

export const logger = {
  debug: (module: string, message: string, data?: unknown) => {
    writeLog(formatMessage('DEBUG', module, message, data));
  },
  
  info: (module: string, message: string, data?: unknown) => {
    writeLog(formatMessage('INFO', module, message, data));
  },
  
  warn: (module: string, message: string, data?: unknown) => {
    writeLog(formatMessage('WARN', module, message, data));
  },
  
  error: (module: string, message: string, data?: unknown) => {
    writeLog(formatMessage('ERROR', module, message, data));
  },
  
  getLogPath: () => LOG_FILE,
};

export default logger;
