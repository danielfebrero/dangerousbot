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
import { getToolResultStore, ToolExecution } from '../core/tool-result-store.js';
import { getMessageEmbedder, initMessageEmbedder } from '../core/message-embedder.js';
import { getCompressor } from '../core/compressor.js';
import { getTokenTracker, initTokenTracker } from '../core/token-tracker.js';
import { MEMORY } from '../config.js';
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
  private pendingContinuationThreadId: string | null = null;
  private pendingContinuationSource: 'webapp' | 'telegram' | null = null;
  private pendingContinuationTelegramUserId: number | null = null;
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
    this.wsManager.setStopHandler(async (clientId, threadId) => {
      this.processingClients.delete(clientId);
      logger.info('Server', `Stop signal received for client ${clientId}, thread ${threadId}`);
      
      // Annuler l'exécution des tools en cours sur ce thread
      if (threadId) {
        const { cancelThreadExecution } = await import('../core/tool-cancellation.js');
        const cancelled = cancelThreadExecution(threadId, 'user_cancelled');
        if (cancelled) {
          logger.info('Server', `Cancelled active tool execution on thread ${threadId}`);
        }
      }
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

    // Initialiser le token tracker
    initTokenTracker(MEMORY.TOKEN_LIMIT_FOR_COMPRESSION);
    logger.info('Server', 'Token tracker initialisé');

    if (openRouterApiKey) {
      this.brain.initContextSystem(openRouterApiKey, apiKey);
      logger.info('Server', 'Système de contexte (embeddings) initialisé');

      // Initialiser le message embedder et réparer les embeddings manquants
      const embedder = initMessageEmbedder();
      embedder.repairMissingEmbeddings()
        .then(result => {
          if (result.repaired > 0 || result.failed > 0) {
            logger.info('Server', `Message embeddings repair: ${result.repaired} repaired, ${result.failed} failed`);
          }
        })
        .catch(err => logger.error('Server', 'Message embeddings repair failed:', err));
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

    // Marquer ce thread comme busy pour le mécanisme de force restart
    this.processingClients.add(options.clientId);
    (global as any).__busyThreads = this.processingClients;
    (global as any).__currentThreadId = threadId;
    (global as any).__currentClientId = options.clientId;
    
    this.wsManager.sendBotTyping(threadId, true);

    // Sauvegarder le message utilisateur dans le thread
    const threadManager = getThreadManager();
    const userMsgId = threadManager.addMessage(threadId, 'user', userMessage, undefined, options.images);

    // Embedder le message utilisateur en background
    try {
      const embedder = getMessageEmbedder();
      embedder.embedMessageAsync(userMsgId, userMessage);
    } catch (e) {
      // Embedder non initialisé, ignorer
    }

    // Envoyer l'estimation initiale des tokens (contexte actuel)
    const tokenTracker = getTokenTracker();
    const initialStats = tokenTracker.getStats(threadId);
    this.wsManager.sendTokenUpdate(threadId, initialStats);

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
          } else if (chunk.type === 'usage' && chunk.inputTokens !== undefined) {
            // Mise à jour temps réel pendant le streaming
            const streamStats = tokenTracker.getStatsWithPending(
              threadId,
              chunk.inputTokens,
              chunk.outputTokens || 0
            );
            this.wsManager.sendTokenUpdate(threadId, streamStats);
          }
        },
        'webapp',
        threadId,
        threadTitle
      );

      // CRITICAL: Enregistrer l'usage de cet appel API (pas seulement le dernier!)
      if (response.usage) {
        tokenTracker.recordApiCall(
          threadId,
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.cost
        );
        const postThinkStats = tokenTracker.getStats(threadId);
        this.wsManager.sendTokenUpdate(threadId, postThinkStats);
      }

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
            // Le texte a déjà été streamé via le callback onChunk, pas besoin de renvoyer
            // On skip pour éviter la duplication côté frontend
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

            // Créer le contexte d'exécution avec signal d'annulation
            const { createExecutionContext, releaseExecutionContext } = await import('../core/tool-cancellation.js');
            const { signal } = createExecutionContext(block.name, threadId);

            // Exécuter l'outil avec gestion des erreurs et mesure du temps
            let result: any;
            const startTime = performance.now();
            try {
              result = await this.toolExecutor.execute(
                block.name,
                toolInput as ToolInput,
                signal,
                { threadId }  // Passer le threadId au contexte des tools
              );
            } catch (toolError) {
              const errorMessage = (toolError as Error).message || 'Tool execution failed';
              // Détecter si c'est une annulation
              if (errorMessage.includes('cancelled') || errorMessage.includes('abort')) {
                result = {
                  success: false,
                  cancelled: true,
                  error: 'Exécution annulée par l\'utilisateur'
                };
              } else {
                result = { error: errorMessage, success: false };
              }
              logger.error('Server', `Tool execution failed: ${block.name}`, { error: errorMessage });
            } finally {
              releaseExecutionContext(threadId);
            }
            const executionTimeMs = Math.round(performance.now() - startTime);

            // Ajouter un avertissement si le parsing était partiel
            if (isPartialParse && result && !result.error) {
              result._warning = `Arguments partiellement parsés (champs potentiellement tronqués: ${truncatedFields.join(', ')})`;
              result._status = 'warning';
            }

            this.wsManager.sendToolResult(threadId, block.name, result, executionId);

            // Envoyer une mise à jour des tokens après chaque tool call
            const toolStats = tokenTracker.getStats(threadId);
            this.wsManager.sendTokenUpdate(threadId, toolStats);

            // Déterminer le status de l'exécution
            const executionStatus: 'success' | 'error' = result.success === false || result.error ? 'error' : 'success';
            const timestamp = new Date().toISOString();

            // Sauvegarder l'exécution complète dans tool_executions
            const toolResultStore = getToolResultStore();
            const toolExecution: ToolExecution = {
              toolCallId: executionId,
              toolName: block.name,
              timestamp,
              status: executionStatus,
              input: toolInput as Record<string, unknown>,
              output: result,
              error: result.error || undefined,
              metadata: {
                executionTimeMs,
                threadId,
                messageId: undefined
              }
            };
            toolResultStore.saveToolExecution(toolExecution);

            // Générer le résumé pour le contexte LLM
            const toolSummary = toolResultStore.formatToolSummary(toolExecution);

            // Vérifier si le résultat contient une image
            if (result.type === 'image' && result.source) {
              const toolInputCasted = block.input as { path?: string };
              threadManager.addMessage(threadId, 'user', `Image chargée depuis ${toolInputCasted?.path || 'fichier'}`, undefined, [{
                type: 'image',
                source: result.source
              }]);
              // Ajouter aussi à l'historique mémoire du Brain
              this.brain.addToolResult(block.id, JSON.stringify({ type: 'image_loaded' }), threadId);
            } else {
              const toolResultStr = JSON.stringify(result);
              // Persister le RÉSUMÉ en DB (pour après redémarrage et tours suivants)
              threadManager.addToolResult(threadId, block.id, toolSummary);
              // CRITICAL: Ajouter le résultat COMPLET à l'historique mémoire pour continueAfterToolStream
              // L'executionId permet le remplacement par résumé aux tours suivants
              this.brain.addToolResult(block.id, toolResultStr, threadId, executionId);
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
            } else if (chunk.type === 'usage' && chunk.inputTokens !== undefined) {
              // Mise à jour temps réel pendant le streaming
              const streamStats = tokenTracker.getStatsWithPending(
                threadId,
                chunk.inputTokens,
                chunk.outputTokens || 0
              );
              this.wsManager.sendTokenUpdate(threadId, streamStats);
            }
          },
          threadId // Passer le threadId pour maintenir l'isolation
        );

        // CRITICAL: Enregistrer l'usage de chaque appel continueAfterToolStream
        if (response.usage) {
          tokenTracker.recordApiCall(
            threadId,
            response.usage.input_tokens,
            response.usage.output_tokens,
            response.cost
          );
          const postToolStats = tokenTracker.getStats(threadId);
          this.wsManager.sendTokenUpdate(threadId, postToolStats);
        }
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
        const assistantMsgId = threadManager.addMessage(threadId, 'assistant', finalText);

        // Embedder le message assistant en background
        try {
          const embedder = getMessageEmbedder();
          embedder.embedMessageAsync(assistantMsgId, finalText);
        } catch (e) {
          // Embedder non initialisé, ignorer
        }
      }

      // Envoyer les stats d'usage finales (l'usage a déjà été recordé après chaque API call)
      if (response.usage) {
        // Envoyer l'ancien format usage (pour compatibilité)
        this.wsManager.sendUsage(
          threadId,
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.cost
        );

        // Envoyer le nouveau format token_update avec toutes les stats cumulées
        const finalStats = tokenTracker.getStats(threadId);
        this.wsManager.sendTokenUpdate(threadId, finalStats);

        // Vérifier si compression automatique nécessaire (basé sur contexte estimé)
        if (finalStats.estimatedContextTokens > MEMORY.TOKEN_LIMIT_FOR_COMPRESSION) {
          logger.info('Server', `Context limit exceeded (${finalStats.estimatedContextTokens} > ${MEMORY.TOKEN_LIMIT_FOR_COMPRESSION}), triggering auto-compression`);
          this.wsManager.sendSystem(threadId, '📦 Compression automatique du contexte en cours...');

          const compressor = getCompressor();
          if (compressor) {
            compressor.compressSession(undefined, threadId)
              .then(result => {
                if (result) {
                  // Supprimer les messages originaux pour libérer le contexte
                  const clearedCount = compressor.clearCompressedMessages(undefined, threadId);
                  this.wsManager.sendSystem(threadId, `✅ Contexte compressé: ${result.message_ids.length} messages → résumé (${clearedCount} messages effacés)`);
                  // Envoyer les stats mises à jour après compression et nettoyage
                  const postCompressStats = tokenTracker.getStats(threadId);
                  this.wsManager.sendTokenUpdate(threadId, postCompressStats);
                  logger.info('Server', `Auto-compression complete: ${result.message_ids.length} messages compressed, ${clearedCount} cleared`);
                }
              })
              .catch(err => {
                logger.error('Server', 'Auto-compression failed:', err);
              });
          }
        }
      }

      // Vérifier si un restart est en attente
      const pendingRestart = (global as any).__pendingRestart;
      if (pendingRestart) {
        delete (global as any).__pendingRestart;
        logger.info('Server', `Restart programmé: ${pendingRestart.reason}`);
        // Utiliser sendRestartSignal pour que le frontend affiche le message correctement
        this.wsManager.sendRestartSignal(pendingRestart.reason);

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
      // Mettre à jour les variables globales de suivi
      (global as any).__busyThreads = this.processingClients;
      delete (global as any).__currentThreadId;
      delete (global as any).__currentClientId;
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
      this.pendingContinuationThreadId = restartInfo.threadId || null;
      this.pendingContinuationSource = restartInfo.source || null;
      this.pendingContinuationTelegramUserId = restartInfo.telegramUserId || null;
      logger.info('Server', `Message de continuation en attente (redémarrage détecté, thread: ${this.pendingContinuationThreadId || 'main'}, source: ${this.pendingContinuationSource || 'webapp'})`);

      // Si c'est Telegram, envoyer le message immédiatement après le démarrage
      if (this.pendingContinuationSource === 'telegram') {
        this.sendTelegramContinuationMessage();
      }
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
        const threadManager = getThreadManager();
        
        // Utiliser le threadId d'origine s'il existe et est valide
        const targetThread = this.pendingContinuationThreadId 
          ? threadManager.getThread(this.pendingContinuationThreadId)
          : threadManager.getMainThread();
          
        if (targetThread) {
          threadManager.addMessage(targetThread.id, 'assistant', this.pendingContinuationMessage!);
          this.wsManager.sendBotMessage(targetThread.id, this.pendingContinuationMessage!);
          logger.info('Server', `Message de continuation envoyé dans thread ${targetThread.id}`);
        } else {
          // Fallback sur le main thread si le thread d'origine n'existe plus
          const mainThread = threadManager.getMainThread();
          if (mainThread) {
            threadManager.addMessage(mainThread.id, 'assistant', this.pendingContinuationMessage!);
            this.wsManager.sendBotMessage(mainThread.id, this.pendingContinuationMessage!);
            logger.info('Server', 'Message de continuation envoyé dans main thread (fallback)');
          }
        }

        this.pendingContinuationMessage = null;
        this.pendingContinuationThreadId = null;
        this.lifecycle.clearRestarted();
      }, 500);
    }
  }

  // Envoyer le message de continuation à Telegram après redémarrage
  private async sendTelegramContinuationMessage(): Promise<void> {
    if (!this.pendingContinuationMessage || !this.pendingContinuationTelegramUserId) {
      return;
    }

    // Attendre que le bot Telegram soit initialisé
    setTimeout(async () => {
      try {
        const { getTelegramBot } = await import('../telegram/bot.js');
        const telegramBot = getTelegramBot();

        const threadManager = getThreadManager();
        const memory = getMemory();

        // Utiliser le threadId d'origine s'il existe et est valide
        const targetThreadId = this.pendingContinuationThreadId;
        const targetThread = targetThreadId ? threadManager.getThread(targetThreadId) : null;

        if (targetThread) {
          // Ajouter le message dans le bon thread
          threadManager.addMessage(targetThread.id, 'assistant', this.pendingContinuationMessage!);

          // S'assurer que le thread actif de l'utilisateur Telegram est bien défini
          memory.setTelegramActiveThread(this.pendingContinuationTelegramUserId!, targetThread.id);

          logger.info('Server', `Message de continuation Telegram préparé pour thread ${targetThread.id}`);
        }

        // Envoyer via Telegram
        const sent = await telegramBot.sendMessageToMaster(this.pendingContinuationMessage!);
        if (sent) {
          logger.info('Server', 'Message de continuation envoyé via Telegram');
        } else {
          logger.warn('Server', 'Impossible d\'envoyer le message de continuation via Telegram (pas de session active)');
        }

        this.pendingContinuationMessage = null;
        this.pendingContinuationThreadId = null;
        this.pendingContinuationSource = null;
        this.pendingContinuationTelegramUserId = null;
        this.lifecycle.clearRestarted();
      } catch (error) {
        logger.error('Server', `Erreur envoi message Telegram: ${error}`);
      }
    }, 2000); // Attendre 2 secondes pour que le bot Telegram soit prêt
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
