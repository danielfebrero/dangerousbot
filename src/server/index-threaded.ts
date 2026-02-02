/**
 * Server Threaded - Serveur Express + WebSocket avec support des threads multiples
 */

import express, { Application } from 'express';
import { createServer, Server } from 'http';
import * as path from 'path';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

import { createRoutes } from './routes.js';
import { WebSocketThreadedManager } from './websocket-threaded.js';
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

export class DangerousBotThreadedServer {
  private app: Application;
  private server: Server;
  private wsManager: WebSocketThreadedManager;
  private brain: Brain | null = null;
  private toolExecutor: ToolExecutor;
  private projectRoot: string;
  private lifecycle: Lifecycle;
  private processingClients: Set<string> = new Set();

  constructor(config: ServerConfig, projectRoot: string) {
    this.projectRoot = projectRoot;
    this.app = express();
    this.server = createServer(this.app);
    this.wsManager = new WebSocketThreadedManager(this.server);
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
      this.wsManager.sendToClient(options.clientId, {
        type: 'system',
        payload: { message: 'Un message est déjà en cours de traitement...' }
      });
      return;
    }

    this.processingClients.add(options.clientId);
    this.wsManager.sendBotTyping(threadId, true);

    // Sauvegarder le message utilisateur dans le thread
    const threadManager = getThreadManager();
    threadManager.addMessage(threadId, 'user', userMessage, undefined, options.images);

    try {
      const tools = getToolDefinitionsForProvider();
      
      // Récupérer l'historique du thread pour le brain
      const threadHistory = threadManager.getThreadMessages(threadId);
      
      let response = await this.brain.thinkStream(
        userMessage,
        tools,
        options.images,
        options.abortSignal,
        (chunk) => {
          if (chunk.type === 'text' && chunk.text) {
            this.wsManager.sendStreamChunk(threadId, chunk.text);
          }
        }
      );

      // Sauvegarder la réponse dans le thread
      const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      threadManager.addMessage(threadId, 'assistant', responseText);

      // Envoyer la réponse finale
      this.wsManager.sendBotMessage(threadId, responseText);

      // Envoyer les stats d'utilisation
      if (response.usage) {
        this.wsManager.sendUsage(
          threadId,
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.cost
        );
      }

    } catch (error) {
      logger.error('Server', `Erreur de traitement: ${error}`);
      this.wsManager.sendToClient(options.clientId, {
        type: 'error',
        payload: { error: `Erreur: ${(error as Error).message}` }
      });
    } finally {
      this.processingClients.delete(options.clientId);
      this.wsManager.sendBotTyping(threadId, false);
    }
  }

  // Démarrer le serveur
  async start(): Promise<void> {
    const port = process.env.PORT || 3000;
    
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        logger.info('Server', `Serveur démarré sur le port ${port}`);
        resolve();
      });
    });
  }

  // Arrêter le serveur
  stop(): void {
    this.wsManager.close();
    this.server.close();
    logger.info('Server', 'Serveur arrêté');
  }

  // Envoyer un signal de redémarrage à tous les clients
  sendRestartSignal(reason: string): void {
    this.wsManager.sendRestartSignal(reason);
  }
}
