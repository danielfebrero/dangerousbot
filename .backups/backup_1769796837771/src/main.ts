#!/usr/bin/env node

/**
 * DangerousBot - Point d'entrée principal
 * Programme IA autonome et évolutif
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as readline from 'readline';


import { DangerousBotServer } from './server/index.js';
import { Lifecycle } from './core/lifecycle.js';
import { getMemory } from './core/memory.js';
import { initRollbackManager } from './core/rollback.js';
import { SERVER, PATHS, APIS, initializeApiKeys, reloadProviderConfig } from './config.js';

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
  // 1. Variable d'environnement
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // 2. Fichier de secrets
  ensureDirectories();
  if (fs.existsSync(PATHS.ANTHROPIC_KEY_FILE)) {
    return fs.readFileSync(PATHS.ANTHROPIC_KEY_FILE, 'utf-8').trim();
  }

  // 3. Demander à l'utilisateur
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
        // Sauvegarder pour les prochains lancements
        fs.writeFileSync(PATHS.ANTHROPIC_KEY_FILE, apiKey, { mode: 0o600 });
        print('\n✓ Clé API sauvegardée\n', 'green');
      }

      resolve(apiKey);
    });
  });
}

// Récupérer la clé OpenRouter (pour embeddings)
function getOpenRouterKey(): string | undefined {
  // 1. Variable d'environnement
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }

  // 2. Fichier de secrets
  if (fs.existsSync(PATHS.OPENROUTER_KEY_FILE)) {
    return fs.readFileSync(PATHS.OPENROUTER_KEY_FILE, 'utf-8').trim();
  }

  return undefined;
}

// Sauvegarder une clé OpenRouter
function saveOpenRouterKey(apiKey: string): void {
  ensureDirectories();
  fs.writeFileSync(PATHS.OPENROUTER_KEY_FILE, apiKey, { mode: 0o600 });
}

// Afficher la bannière
function showBanner(): void {
  console.clear();
  print(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ██████╗  █████╗ ███╗   ██╗ ██████╗ ███████╗██████╗         ║
║   ██╔══██╗██╔══██╗████╗  ██║██╔════╝ ██╔════╝██╔══██╗        ║
║   ██║  ██║███████║██╔██╗ ██║██║  ███╗█████╗  ██████╔╝        ║
║   ██║  ██║██╔══██║██║╚██╗██║██║   ██║██╔══╝  ██╔══██╗        ║
║   ██████╔╝██║  ██║██║ ╚████║╚██████╔╝███████╗██║  ██║        ║
║   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝        ║
║                        BOT                                   ║
║                                                              ║
║   Programme IA Autonome et Évolutif                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`, 'cyan');
}

// Point d'entrée principal
async function main(): Promise<void> {
  showBanner();

  const isDev = process.env.NODE_ENV !== 'production';
  print(`Mode: ${isDev ? 'Développement' : 'Production'}`, 'dim');

  // Lifecycle - single instance
  const lifecycle = new Lifecycle(PROJECT_ROOT);
  lifecycle.setupSignalHandlers();

  if (!lifecycle.acquireLock()) {
    print('Erreur: Impossible d\'acquérir le lock. Une autre instance est-elle en cours?', 'red');
    process.exit(1);
  }

  print('✓ Lock acquis (single instance)', 'green');

  // Récupérer la clé API
  const apiKey = await getApiKey();
  if (!apiKey) {
    print('Erreur: Clé API requise pour démarrer.', 'red');
    lifecycle.releaseLock();
    process.exit(1);
  }

  print('✓ Clé API configurée', 'green');

  // Initialiser la mémoire
  const memory = getMemory();
  const stats = memory.getStats();
  print(`✓ Mémoire initialisée (${stats.messages} messages, ${stats.knowledge} connaissances)`, 'green');

  // Charger le provider persisté depuis la DB
  const activeProvider = reloadProviderConfig();
  print(`✓ Provider chargé: ${activeProvider}`, 'green');

  // Initialiser toutes les clés API depuis les fichiers secrets
  initializeApiKeys();
  
  // Récupérer la clé OpenRouter pour les embeddings
  let openRouterKey = getOpenRouterKey();
  
  // Si pas de clé OpenRouter et qu'on a une clé dans les instructions (première config)
  // La clé sera passée via variable d'env ou config ultérieure
  if (openRouterKey) {
    print('✓ Clé OpenRouter configurée (embeddings activés)', 'green');
  } else {
    print('○ Clé OpenRouter non configurée (embeddings désactivés)', 'yellow');
  }
  
  // Vérifier la clé Mistral
  if (APIS.MISTRAL_API_KEY) {
    print('✓ Clé Mistral configurée (second regard activé)', 'green');
  } else {
    print('○ Clé Mistral non configurée (second regard désactivé)', 'yellow');
  }

  // Initialiser le système de rollback
  const rollbackManager = initRollbackManager(PROJECT_ROOT);
  const backups = rollbackManager.listBackups();
  print(`✓ Système de rollback initialisé (${backups.length} backups disponibles)`, 'green');

  // Créer et démarrer le serveur
  const server = new DangerousBotServer({ port: PORT, host: HOST }, PROJECT_ROOT);
  server.initBrain(apiKey, openRouterKey);
  server.loadSessionHistory();

  await server.start(PORT, HOST);
  print(`✓ Serveur démarré sur http://${HOST}:${PORT}`, 'green');

  // Setup WebSocket handlers
  const wsManager = server.getWSManager();

  // Configurer le handler de messages (avec support multi-modal et abort)
  wsManager.setMessageHandler(async (text: string, images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>, abortSignal?: AbortSignal) => {
    await server.processMessage(text, images, abortSignal);
  });

  // Configurer le handler de stop
  wsManager.setStopHandler(() => {
    console.log('[Main] Signal STOP reçu, annulation de la requête...');
  });

  // Configurer le provider d'historique (avec support images)
  wsManager.setHistoryProvider(() => {
    const history = memory.getMessages();
    return history.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      tool_calls: msg.tool_calls,
      images: msg.images
    }));
  });

  // Configurer le callback pour la première connexion (message de continuation après redémarrage)
  wsManager.setOnFirstConnection(() => {
    server.sendContinuationMessage();
  });

  print('\n─────────────────────────────────────────────────────────────', 'dim');
  print(`Ouvrez http://${HOST}:${PORT} dans votre navigateur`, 'bright');
  print('─────────────────────────────────────────────────────────────\n', 'dim');

  // En mode dev, afficher les instructions
  if (isDev) {
    print('Mode développement - Rechargement manuel requis (Ctrl+C puis npm run dev)', 'yellow');
  }
}

// Démarrer
main().catch((error) => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});
