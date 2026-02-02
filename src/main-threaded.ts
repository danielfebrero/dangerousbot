#!/usr/bin/env node

/**
 * DangerousBot Threaded - Point d'entrée avec support des threads multiples
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as readline from 'readline';

import { DangerousBotThreadedServer } from './server/index-threaded.js';
import { Lifecycle } from './core/lifecycle.js';
import { getMemory } from './core/memory.js';
import { initRollbackManager } from './core/rollback.js';
import { logger, enableConsoleCapture } from './core/logger.js';
import { SERVER, PATHS, APIS, initializeApiKeys, reloadProviderConfig, loadApiKey } from './config.js';

// Activer la capture des console.* dès le démarrage
enableConsoleCapture();

// Configuration
const PORT = parseInt(process.env.PORT || String(SERVER.DEFAULT_PORT), 10);
const HOST = process.env.HOST || SERVER.DEFAULT_HOST;
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Couleurs terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
} as const;

function print(text: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

// Assurer que les répertoires existent
function ensureDirectories(): void {
  if (!fs.existsSync(PATHS.SECRETS_DIR)) {
    fs.mkdirSync(PATHS.SECRETS_DIR, { recursive: true, mode: 0o700 });
  }
}

// Récupérer ou demander la clé API Anthropic
async function getApiKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  ensureDirectories();
  if (fs.existsSync(PATHS.ANTHROPIC_KEY_FILE)) {
    return fs.readFileSync(PATHS.ANTHROPIC_KEY_FILE, 'utf-8').trim();
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    print('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
    print('║     Premier lancement de DangerousBot                      ║', 'cyan');
    print('╚════════════════════════════════════════════════════════════╝\n', 'cyan');

    print('DangerousBot a besoin d\'une clé API Claude (Anthropic).', 'dim');
    print('La clé sera stockée dans ~/.dangerousbot/secrets/\n', 'dim');

    rl.question('Clé API Claude: ', (answer) => {
      rl.close();
      const apiKey = answer.trim();

      if (apiKey) {
        fs.writeFileSync(PATHS.ANTHROPIC_KEY_FILE, apiKey, { mode: 0o600 });
        print('\n✓ Clé API sauvegardée\n', 'green');
      }

      resolve(apiKey);
    });
  });
}

// Récupérer la clé OpenRouter
function getOpenRouterKey(): string | undefined {
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }
  if (fs.existsSync(PATHS.OPENROUTER_KEY_FILE)) {
    return fs.readFileSync(PATHS.OPENROUTER_KEY_FILE, 'utf-8').trim();
  }
  return undefined;
}

// Banner
function showBanner(): void {
  print(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ██████╗  █████╗ ███╗   ██╗ ██████╗ ███████╗██████╗  ██████╗ ███████╗██╗   ██╗███████╗██████╗  ██████╗ ████████╗
║   ██╔══██╗██╔══██╗████╗  ██║██╔═══██╗██╔════╝██╔══██╗██╔═══██╗██╔════╝██║   ██║██╔════╝██╔══██╗██╔═══██╗╚══██╔══╝
║   ██║  ██║███████║██╔██╗ ██║██║   ██║█████╗  ██████╔╝██║   ██║███████╗██║   ██║█████╗  ██████╔╝██║   ██║   ██║   
║   ██║  ██║██╔══██║██║╚██╗██║██║   ██║██╔══╝  ██╔══██╗██║   ██║╚════██║██║   ██║██╔══╝  ██╔══██╗██║   ██║   ██║   
║   ██████╔╝██║  ██║██║ ╚████║╚██████╔╝███████╗██║  ██║╚██████╔╝███████║╚██████╔╝███████╗██████╔╝╚██████╔╝   ██║   
║   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝╚═════╝  ╚═════╝    ╚═╝   
║                                                              ║
║   Programme IA Autonome et Évolutif - MODE THREADS MULTIPLES ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`, 'cyan');
}

// Point d'entrée principal
async function main(): Promise<void> {
  showBanner();

  const isDev = process.env.NODE_ENV !== 'production';
  print(`Mode: ${isDev ? 'Développement' : 'Production'}`, 'dim');

  // Lifecycle
  const lifecycle = new Lifecycle(PROJECT_ROOT);
  lifecycle.setupSignalHandlers();

  if (!lifecycle.acquireLock()) {
    print('Erreur: Impossible d\'acquérir le lock. Une autre instance tourne ?', 'red');
    process.exit(1);
  }

  // Initialiser le rollback manager
  initRollbackManager(PROJECT_ROOT);

  // Charger les clés API
  initializeApiKeys();

  // Récupérer la clé API
  const apiKey = await getApiKey();
  if (!apiKey) {
    print('Erreur: Clé API requise pour démarrer.', 'red');
    lifecycle.releaseLock();
    process.exit(1);
  }

  print('✓ Clé API configurée', 'green');

  const memory = getMemory();
  reloadProviderConfig();
  print(`✓ Provider actif: ${(await import('./config.js')).PROVIDER.ACTIVE}`, 'green');

  const openRouterKey = getOpenRouterKey();

  // Créer et démarrer le serveur avec threads
  const server = new DangerousBotThreadedServer({ port: PORT, host: HOST }, PROJECT_ROOT);
  server.initBrain(apiKey, openRouterKey);

  await server.start();
  print(`✓ Serveur démarré sur http://${HOST}:${PORT}`, 'green');
  print(`✓ Système de threads multiples activé`, 'green');
  print(`✓ ${memory.getStats().messages} messages historiques`, 'dim');

  print('\n🤖 DangerousBot Threaded est prêt !', 'cyan');
  print(`\nOuvrez http://${HOST}:${PORT} dans votre navigateur.`, 'dim');
  print('\nConseils:', 'dim');
  print('  • Cliquez sur le bouton conversation pour créer/switcher de threads', 'dim');
  print('  • Chaque onglet = thread indépendant', 'dim');
  print('  • Les souvenirs sont partagés entre threads', 'dim');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
