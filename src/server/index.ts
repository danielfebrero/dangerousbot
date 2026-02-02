/**
 * Server - Serveur Express + WebSocket pour DangerousBot
 *
 * Fonctionnalités:
 * - Support des threads multiples
 * - Boucle d'exécution des outils
 * - Gestion du changement de provider
 * - Support du redémarrage et message de continuation
 */

import express, { Application } from 'express';
import { createServer, Server } from 'http';
import * as path from 'path';
import * as fs from 'fs';

import { createRoutes } from './routes.js';
import { WebSocketManager } from './websocket.js';
import { Brain } from '../core/brain/index.js';
import { getToolDefinitions, getToolDefinitionsForProvider, ToolExecutor } from '../core/tools.js';
import { getMemory } from '../core/memory.js';
import { getThreadManager } from '../core/thread-manager.js';
import { ServerConfig, ToolInput } from '../core/types.js';
import { Lifecycle } from '../core/lifecycle.js';
import { logger } from '../core/logger.js';
import * as os from 'os';

// Signal pour le message de continuation après redémarrage
const RESTART_MSG_FILE = path.join(os.homedir(), '.dangerousbot', '.restart_message');

export class DangerousBotServer {
  private app: Application;
  private server: Server;
  private wsManager: WebSocketManager;
  private brain: Brain | null = null;
  private toolExecutor: ToolExecutor;
  private projectRoot: string;
  private lifecycle: Lifecycle;
  private processingClients: Set<string> = new Set();
  private pendingContinuationMessage: string | null = null;
  private config: ServerConfig;

  constructor(config: ServerConfig, projectRoot: string) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.app = express();
    this.server = createServer(this.app);
    this.wsManager = new WebSocketManager(this.server);
    this.toolExecutor = new ToolExecutor(projectRoot);
    this.lifecycle = new Lifecycle(projectRoot);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocketHandlers();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Servir les fichiers statiques du frontend
    const webPaths = [
      path.join(this.projectRoot, 'dist', 'web'),
      path.join(__dirname, '..', 'web'),
      path.join(__dirname, 'web'),
      path.join(this.projectRoot, 'src', 'web')
    ];

    for (const webPath of webPaths) {
      if (fs.existsSync(webPath)) {
        this.app.use(express.static(webPath));
        logger.info('Server', `Serving static files from: ${webPath}`);
        break;
      }
    }
  }

  private setupRoutes(): void {
    // API routes
    this.app.use('/api', createRoutes());

    // Thread API routes
    this.app.get('/api/threads', (req, res) => {
      const threadManager = getThreadManager();
      const threads = threadManager.listThreads(true);
      res.json({
        success: true,
        threads: threads.map(t => ({
          id: t.id,
          title: t.title,
          is_main: t.isMain,
          parent_thread_id: t.parentThreadId,
          created_at: t.createdAt,
          updated_at: t.updatedAt,
        }))
      });
    });

    // Fallback to index.html for SPA
    this.app.get('*', (req, res) => {
      const webPaths = [
        path.join(this.projectRoot, 'dist', 'web', 'index.html'),
        path.join(__dirname, '..', 'web', 'index.html'),
        path.join(__dirname, 'web', 'index.html'),
        path.join(this.projectRoot, 'src', 'web', 'index.html')
      ];

      for (const indexPath of webPaths) {
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
          return;
        }
      }

      res.status(404).send('Frontend not found');
    });
  }

  private setupWebSocketHandlers(): void {
    // Configurer le handler de messages avec support des threads
    this.wsManager.setMessageHandler(async (message, threadId, options) => {
      await this.processMessage(message, threadId, {
        images: options.images,
        abortSignal: options.abortSignal,
        clientId: options.clientId
      });
    });

    // Handler de stop par client
    this.wsManager.setStopHandler((clientId) => {
      this.processingClients.delete(clientId);
      logger.info('Server', `Stop signal received for client ${clientId}`);
    });

    // Callback pour la première connexion (message de continuation après redémarrage)
    this.wsManager.setOnFirstConnection(() => {
      this.sendContinuationMessage();
    });
  }

  // Initialiser le brain avec la clé API
  initBrain(apiKey: string, openRouterApiKey?: string): void {
    this.brain = new Brain(apiKey);
    logger.info('Server', 'Brain initialisé');

    if (openRouterApiKey) {
      this.brain.initContextSystem(openRouterApiKey, apiKey);
      logger.info('Server', 'Système de contexte (embeddings) initialisé');
    }
  }

  // Charger l'historique de la session dans le brain
  loadSessionHistory(): void {
    if (!this.brain) {
      return;
    }

    const memory = getMemory();
    const messages = memory.getMessages();

    if (messages.length > 0) {
      this.brain.loadHistory();
      logger.info('Server', `Historique chargé: ${messages.length} messages`);
    }
  }

  // Obtenir le WebSocket manager
  getWSManager(): WebSocketManager {
    return this.wsManager;
  }

  // Traiter un message utilisateur dans un thread spécifique
  async processMessage(
    userMessage: string,
    threadId: string,
    options: {
      images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
      abortSignal?: AbortSignal;
      clientId: string;
    }
  ): Promise<void> {
    if (!this.brain) {
      this.wsManager.sendToClient(options.clientId, {
        type: 'error',
        payload: { error: 'Brain non initialisé. Clé API manquante.' }
      });
      return;
    }

    if (this.processingClients.has(options.clientId)) {
      this.wsManager.sendSystem(threadId, 'Un message est déjà en cours de traitement...');
      return;
    }

    this.processingClients.add(options.clientId);
    this.wsManager.sendBotTyping(threadId, true);

    // Sauvegarder le message utilisateur dans le thread
    const threadManager = getThreadManager();
    threadManager.addMessage(threadId, 'user', userMessage, undefined, options.images);

    try {
      const tools = getToolDefinitionsForProvider();

      // Récupérer les infos du thread pour le contexte
      const thread = threadManager.getThread(threadId);
      const threadTitle = thread?.title || 'Unknown Thread';

      // Utiliser le streaming pour une meilleure UX
      let response = await this.brain.thinkStream(
        userMessage,
        tools,
        options.images,
        options.abortSignal,
        (chunk) => {
          if (chunk.type === 'text' && chunk.text) {
            this.wsManager.sendStreamChunk(threadId, chunk.text);
          }
        },
        'webapp',
        threadId,
        threadTitle
      );

      // Vérifier si un fallback de provider a eu lieu
      const providerSwitched = (global as any).__providerSwitched;
      if (providerSwitched) {
        delete (global as any).__providerSwitched;
        const switchMessage = `⚠️ Provider ${providerSwitched.from} indisponible (${providerSwitched.reason}). Basculé sur ${providerSwitched.to}.`;
        this.wsManager.sendProviderSwitch(threadId, providerSwitched.from, providerSwitched.to, providerSwitched.reason);
        threadManager.addMessage(threadId, 'system', switchMessage);
      }

      // Boucle de traitement des outils
      while (response.stopReason === 'tool_use') {
        // Vérifier si abort a été demandé
        if (options.abortSignal?.aborted) {
          logger.debug('Server', 'Abort détecté dans la boucle tool_use');
          throw new Error('Request aborted by user');
        }

        // Extraire les tool_calls et le texte de la réponse
        const roundToolCalls: Array<{ id?: string; name: string; input: unknown }> = [];
        let roundText = '';
        for (const block of response.content) {
          if (block.type === 'text' && block.text) {
            roundText += block.text;
          } else if (block.type === 'tool_use') {
            roundToolCalls.push({ id: block.id, name: block.name, input: block.input });
          }
        }

        // CRITICAL: Sauvegarder le message assistant avec tool_calls en DB
        // (HistoryManager ne persiste plus en DB pour éviter les doublons)
        if (roundToolCalls.length > 0) {
          threadManager.addMessage(threadId, 'assistant', roundText, roundToolCalls);
        }

        for (const block of response.content) {
          if (block.type === 'text') {
            if (block.text && block.text.trim()) {
              this.wsManager.sendBotMessage(threadId, block.text);
            }
          } else if (block.type === 'tool_use') {
            // Générer un ID unique pour ce tool call
            const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Détecter si les arguments ont été partiellement parsés
            const toolInput = block.input as ToolInput & { _partialParse?: boolean; _truncatedFields?: string[] };
            const isPartialParse = toolInput?._partialParse === true;
            const truncatedFields = toolInput?._truncatedFields || [];

            // Nettoyer les métadonnées internes avant exécution
            if (isPartialParse) {
              delete (toolInput as any)._partialParse;
              delete (toolInput as any)._truncatedFields;
              logger.warn('Server', `Tool '${block.name}' executing with partially parsed arguments`, { truncatedFields });
            }

            // Envoyer le tool use avec l'ID unique
            this.wsManager.sendToolUse(threadId, block.name, toolInput, executionId);

            // Exécuter l'outil avec gestion des erreurs
            let result: any;
            try {
              result = await this.toolExecutor.execute(
                block.name,
                toolInput as ToolInput
              );
            } catch (toolError) {
              const errorMessage = (toolError as Error).message || 'Tool execution failed';
              result = { error: errorMessage, success: false };
              logger.error('Server', `Tool execution failed: ${block.name}`, { error: errorMessage });
            }

            // Ajouter un avertissement si le parsing était partiel
            if (isPartialParse && result && !result.error) {
              result._warning = `Arguments partiellement parsés (champs potentiellement tronqués: ${truncatedFields.join(', ')})`;
              result._status = 'warning';
            }

            this.wsManager.sendToolResult(threadId, block.name, result, executionId);

            // Vérifier si le résultat contient une image
            if (result.type === 'image' && result.source) {
              const toolInputCasted = block.input as { path?: string };
              threadManager.addMessage(threadId, 'user', `Image chargée depuis ${toolInputCasted?.path || 'fichier'}`, undefined, [{
                type: 'image',
                source: result.source
              }]);
              // Ajouter aussi à l'historique mémoire du Brain
              this.brain.addToolResult(block.id, JSON.stringify({ type: 'image_loaded' }), threadId);
            } else if (result._webSearchPassthrough) {
              const toolResultStr = JSON.stringify(result.arguments);
              // Persister en DB
              threadManager.addToolResult(threadId, block.id, toolResultStr);
              // CRITICAL: Ajouter à l'historique mémoire du Brain pour continueAfterToolStream
              this.brain.addToolResult(block.id, toolResultStr, threadId);
            } else {
              const toolResultStr = JSON.stringify(result);
              // Persister en DB
              threadManager.addToolResult(threadId, block.id, toolResultStr);
              // CRITICAL: Ajouter à l'historique mémoire du Brain pour continueAfterToolStream
              this.brain.addToolResult(block.id, toolResultStr, threadId);
            }

            // Vérifier si un redémarrage est nécessaire
            if (result.needsRestart) {
              this.wsManager.sendSystem(threadId, 'Redémarrage du serveur en cours...');
            }

            // Vérifier si abort a été demandé après l'exécution d'un tool
            if (options.abortSignal?.aborted) {
              logger.debug('Server', 'Abort détecté après exécution tool');
              throw new Error('Request aborted by user');
            }

            // Vérifier si un changement de provider est demandé
            const pendingProviderSwitch = (global as any).__pendingProviderSwitch;
            if (pendingProviderSwitch) {
              delete (global as any).__pendingProviderSwitch;
              const previousProvider = this.brain.getCurrentProvider().name;
              this.brain.switchProvider(pendingProviderSwitch);
              const switchMessage = `🔄 Provider changé: ${previousProvider} → ${pendingProviderSwitch}`;
              this.wsManager.sendProviderSwitch(threadId, previousProvider, pendingProviderSwitch, 'user_request');
              threadManager.addMessage(threadId, 'system', switchMessage);
            }
          }
        }

        // Vérifier si la requête a été annulée
        if (options.abortSignal?.aborted) {
          throw new Error('Request aborted by user');
        }

        // Continuer la conversation avec streaming
        response = await this.brain.continueAfterToolStream(
          tools,
          options.abortSignal,
          (chunk) => {
            if (chunk.type === 'text' && chunk.text) {
              this.wsManager.sendStreamChunk(threadId, chunk.text);
            }
          },
          threadId // Passer le threadId pour maintenir l'isolation
        );
      }

      // Traiter la réponse finale
      let finalText = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          finalText += block.text;
        }
      }

      // CRITICAL: Sauvegarder le message assistant final en DB
      // (HistoryManager ne persiste plus en DB, c'est le serveur qui gère)
      if (finalText.trim()) {
        threadManager.addMessage(threadId, 'assistant', finalText);
      }

      // Envoyer les stats d'usage
      if (response.usage) {
        this.wsManager.sendUsage(
          threadId,
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.cost
        );
      }

      // Vérifier si un restart est en attente
      const pendingRestart = (global as any).__pendingRestart;
      if (pendingRestart) {
        delete (global as any).__pendingRestart;
        logger.info('Server', `Restart programmé: ${pendingRestart.reason}`);
        this.wsManager.sendSystem(threadId, `Redémarrage dans 2 secondes: ${pendingRestart.reason}`);

        setTimeout(() => {
          this.lifecycle.restart(pendingRestart.reason);
        }, 2000);
      }

    } catch (error) {
      if ((error as Error).message === 'Request aborted by user' ||
          (error as Error).name === 'AbortError' ||
          options.abortSignal?.aborted) {
        logger.info('Server', 'Requête annulée par l\'utilisateur');
        this.wsManager.sendSystem(threadId, '🛑 Génération arrêtée.');
        this.wsManager.sendUsage(threadId, 0, 0, { input_cost: 0, output_cost: 0, total_cost: 0 });
      } else {
        logger.error('Server', 'Erreur lors du traitement du message', { error: (error as Error).message });
        this.wsManager.sendToClient(options.clientId, {
          type: 'error',
          payload: { error: `Erreur: ${(error as Error).message}` }
        });
      }
    } finally {
      this.processingClients.delete(options.clientId);
      this.wsManager.sendBotTyping(threadId, false);
      // Toujours libérer le HistoryManager, même en cas d'erreur
      this.brain.releaseHistoryManager(threadId);
    }
  }

  // Démarrer le serveur
  start(port?: number, host?: string): Promise<void> {
    const finalPort = port || this.config.port || 3000;
    const finalHost = host || this.config.host || 'localhost';

    // Vérifier si on vient de redémarrer
    const restartInfo = this.lifecycle.checkRestarted();
    if (restartInfo.restarted) {
      this.pendingContinuationMessage = `🔄 Redémarrage effectué ! Je suis de retour et prêt à continuer.\n\n_(Provider actif: **${this.brain?.getCurrentProvider().name || 'inconnu'}**)_`;
      logger.info('Server', 'Message de continuation en attente (redémarrage détecté)');
    }

    return new Promise((resolve) => {
      this.server.listen(finalPort, finalHost, () => {
        logger.info('Server', `DangerousBot Threaded écoute sur http://${finalHost}:${finalPort}`);
        resolve();
      });
    });
  }

  // Envoyer le message de continuation après redémarrage
  sendContinuationMessage(): void {
    if (this.pendingContinuationMessage) {
      setTimeout(() => {
        // Sauvegarder le message de continuation dans le main thread
        const threadManager = getThreadManager();
        const mainThread = threadManager.getMainThread();
        if (mainThread) {
          threadManager.addMessage(mainThread.id, 'assistant', this.pendingContinuationMessage!);
          this.wsManager.sendBotMessage(mainThread.id, this.pendingContinuationMessage!);
        }

        this.pendingContinuationMessage = null;
        this.lifecycle.clearRestarted();
        logger.info('Server', 'Message de continuation envoyé et sauvegardé');
      }, 500);
    }
  }

  // Envoyer un signal de redémarrage à tous les clients
  sendRestartSignal(reason: string): void {
    this.wsManager.sendRestartSignal(reason);
  }

  // Arrêter le serveur
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wsManager.close();
      this.server.close(() => {
        logger.info('Server', 'Serveur arrêté');
        resolve();
      });
    });
  }
}
