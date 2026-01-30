#!/usr/bin/env node

/**
 * DangerousBot - Point d'entrée principal
 * Programme IA autonome et évolutif
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as readline from 'readline';
import { WebSocket } from 'ws';

import { DangerousBotServer } from './server/index.js';
import { Lifecycle } from './core/lifecycle.js';
import { getMemory } from './core/memory.js';

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || 'localhost';
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Chemins pour les clés API
const DANGEROUSBOT_DIR = path.join(os.homedir(), '.dangerousbot');
const SECRETS_DIR = path.join(DANGEROUSBOT_DIR, 'secrets');
const API_KEY_FILE = path.join(SECRETS_DIR, 'anthropic_api_key');
const OPENROUTER_KEY_FILE = path.join(SECRETS_DIR, 'openrouter_api_key');

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
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
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
  if (fs.existsSync(API_KEY_FILE)) {
    return fs.readFileSync(API_KEY_FILE, 'utf-8').trim();
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
        fs.writeFileSync(API_KEY_FILE, apiKey, { mode: 0o600 });
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
  if (fs.existsSync(OPENROUTER_KEY_FILE)) {
    return fs.readFileSync(OPENROUTER_KEY_FILE, 'utf-8').trim();
  }

  return undefined;
}

// Sauvegarder une clé OpenRouter
function saveOpenRouterKey(apiKey: string): void {
  ensureDirectories();
  fs.writeFileSync(OPENROUTER_KEY_FILE, apiKey, { mode: 0o600 });
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

  // Récupérer la clé OpenRouter pour les embeddings
  let openRouterKey = getOpenRouterKey();
  
  // Si pas de clé OpenRouter et qu'on a une clé dans les instructions (première config)
  // La clé sera passée via variable d'env ou config ultérieure
  if (openRouterKey) {
    print('✓ Clé OpenRouter configurée (embeddings activés)', 'green');
  } else {
    print('○ Clé OpenRouter non configurée (embeddings désactivés)', 'yellow');
  }

  // Créer et démarrer le serveur
  const server = new DangerousBotServer({ port: PORT, host: HOST }, PROJECT_ROOT);
  server.initBrain(apiKey, openRouterKey);
  server.loadSessionHistory();

  await server.start(PORT, HOST);
  print(`✓ Serveur démarré sur http://${HOST}:${PORT}`, 'green');

  // Setup WebSocket message handler
  const wsManager = server.getWSManager();

  // Gérer les messages entrants via un endpoint WebSocket custom
  const originalWss = (wsManager as any).wss;
  originalWss.on('connection', (ws: WebSocket) => {
    // Envoyer l'historique des messages au client qui se connecte
    const history = memory.getMessages();
    const formattedHistory = history.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    }));
    wsManager.sendHistory(ws, formattedHistory);
    console.log(`[Main] Historique envoyé: ${formattedHistory.length} messages`);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'user_message' && message.payload?.text) {
          await server.processMessage(message.payload.text);
        }
      } catch (error) {
        console.error('[Main] Erreur de parsing message:', error);
      }
    });
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
