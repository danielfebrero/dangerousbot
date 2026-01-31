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
import { logger, enableConsoleCapture } from './core/logger.js';
import { SERVER, PATHS, APIS, initializeApiKeys, reloadProviderConfig } from './config.js';

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

// Vérifier si SearxNG est déjà en cours d'exécution
async function isSearxNGRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8080/healthz', { 
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Health check interval pour SearxNG
let searxngHealthCheckInterval: NodeJS.Timeout | null = null;

// Démarrer le health check régulier de SearxNG (toutes les 60 secondes)
function startSearxNGHealthCheck(): void {
  if (searxngHealthCheckInterval) {
    clearInterval(searxngHealthCheckInterval);
  }
  
  searxngHealthCheckInterval = setInterval(async () => {
    const running = await isSearxNGRunning();
    if (!running) {
      print('🔄 SearxNG détecté comme arrêté, tentative de redémarrage...', 'yellow');
      const started = await startSearxNG();
      if (started) {
        print('✓ SearxNG redémarré automatiquement', 'green');
      } else {
        print('⚠ Impossible de redémarrer SearxNG', 'red');
      }
    }
  }, 60000); // Toutes les 60 secondes
  
  print('✓ Health check SearxNG activé (toutes les 60s)', 'green');
}

// Démarrer SearxNG
async function startSearxNG(): Promise<boolean> {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const path = require('path');
    
    const projectRoot = path.resolve(__dirname, '..');
    const searxngScript = path.join(projectRoot, 'searxng.sh');
    
    print('🚀 Démarrage de SearxNG...', 'cyan');
    
    const child = spawn('bash', [searxngScript, 'start'], {
      detached: true,
      stdio: 'pipe'
    });
    
    child.on('error', (err: Error) => {
      print(`⚠ Erreur lors du démarrage de SearxNG: ${err.message}`, 'yellow');
      resolve(false);
    });
    
    child.on('exit', (code: number) => {
      if (code === 0) {
        resolve(true);
      } else {
        print(`⚠ SearxNG a retourné le code ${code}`, 'yellow');
        resolve(false);
      }
    });
    
    // Timeout de 10 secondes
    setTimeout(() => {
      resolve(true); // On assume que ça a marché si pas d'erreur rapide
    }, 10000);
  });
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
  logger.info('Main', 'Lock acquis (single instance)');

  // Récupérer la clé API
  const apiKey = await getApiKey();
  if (!apiKey) {
    print('Erreur: Clé API requise pour démarrer.', 'red');
    logger.error('Main', 'Clé API requise pour démarrer');
    lifecycle.releaseLock();
    process.exit(1);
  }

  print('✓ Clé API configurée', 'green');
  logger.info('Main', 'Clé API configurée');

  // Vérifier et démarrer SearxNG si nécessaire
  const searxngRunning = await isSearxNGRunning();
  if (searxngRunning) {
    print('✓ SearxNG déjà en cours d\'exécution', 'green');
  } else {
    const started = await startSearxNG();
    if (started) {
      print('✓ SearxNG démarré', 'green');
      // Attendre un peu que le service soit prêt
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      print('⚠ Impossible de démarrer SearxNG (fonctionnalité recherche désactivée)', 'yellow');
    }
  }
  
  // Démarrer le health check régulier de SearxNG
  startSearxNGHealthCheck();

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

  // Initialiser l'indexation du code si Mistral est configuré
  if (APIS.MISTRAL_API_KEY) {
    try {
      const { initCodeIndexer, getCodeIndexer } = await import('./core/code-indexer.js');
      const { initCodeEmbeddingService } = await import('./core/code-embedding.js');
      
      const embeddingService = initCodeEmbeddingService(APIS.MISTRAL_API_KEY);
      const indexer = initCodeIndexer(PROJECT_ROOT, memory, embeddingService);
      
      // Vérifier si une indexation est nécessaire
      if (indexer.needsIndexing()) {
        print('📚 Indexation de la codebase en arrière-plan...', 'cyan');
        // Lancer l'indexation en arrière-plan (ne pas bloquer le démarrage)
        indexer.indexAll().then(result => {
          print(`✓ Indexation terminée: ${result.indexed} nouveaux, ${result.updated} mis à jour`, 'green');
        }).catch(err => {
          print(`⚠ Erreur d'indexation: ${err.message}`, 'yellow');
        });
      } else {
        print('✓ Codebase déjà indexée', 'green');
      }
    } catch (err) {
      print(`⚠ Impossible d'initialiser l'indexation: ${(err as Error).message}`, 'yellow');
    }
  }

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
    return history
      // Filter out internal __TOOL_RESULT__ messages (used for persistence, not display)
      .filter(msg => !(msg.role === 'user' && msg.content?.startsWith('__TOOL_RESULT__')))
      .map(msg => ({
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
