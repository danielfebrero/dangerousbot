/**
 * Server - Serveur Express + WebSocket pour DangerousBot
 */

import express, { Application } from 'express';
import { createServer, Server } from 'http';
import * as path from 'path';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

import { createRoutes } from './routes.js';
import { WebSocketManager } from './websocket.js';
import { Brain } from '../core/brain.js';
import { getToolDefinitions, ToolExecutor } from '../core/tools.js';
import { getMemory } from '../core/memory.js';
import { ServerConfig, ToolInput } from '../core/types.js';

export class DangerousBotServer {
  private app: Application;
  private server: Server;
  private wsManager: WebSocketManager;
  private brain: Brain | null = null;
  private toolExecutor: ToolExecutor;
  private projectRoot: string;
  private isProcessing: boolean = false;

  constructor(config: ServerConfig, projectRoot: string) {
    this.projectRoot = projectRoot;
    this.app = express();
    this.server = createServer(this.app);
    this.wsManager = new WebSocketManager(this.server);
    this.toolExecutor = new ToolExecutor(projectRoot);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocketHandlers();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Servir les fichiers statiques du frontend
    // Priorité: dist/web (contient bundle.js) avant src/web
    const webPaths = [
      path.join(this.projectRoot, 'dist', 'web'),
      path.join(__dirname, '..', 'web'),
      path.join(__dirname, 'web'),
      path.join(this.projectRoot, 'src', 'web')
    ];

    for (const webPath of webPaths) {
      if (fs.existsSync(webPath)) {
        this.app.use(express.static(webPath));
        console.log(`[Server] Serving static files from: ${webPath}`);
        break;
      }
    }
  }

  private setupRoutes(): void {
    // API routes
    this.app.use('/api', createRoutes());

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
    // Les messages arrivent via WebSocket, pas via l'API REST
  }

  // Initialiser le brain avec la clé API
  initBrain(apiKey: string): void {
    this.brain = new Brain(apiKey);
    console.log('[Server] Brain initialisé');
  }

  // Traiter un message utilisateur
  async processMessage(userMessage: string): Promise<void> {
    if (!this.brain) {
      this.wsManager.sendError('Brain non initialisé. Clé API manquante.');
      return;
    }

    if (this.isProcessing) {
      this.wsManager.sendSystem('Un message est déjà en cours de traitement...');
      return;
    }

    this.isProcessing = true;
    this.wsManager.sendBotTyping(true);

    try {
      const tools = getToolDefinitions();
      let response = await this.brain.think(userMessage, tools);

      // Boucle de traitement des outils
      while (response.stopReason === 'tool_use') {
        for (const block of response.content) {
          if (block.type === 'text') {
            this.wsManager.sendBotMessage(block.text);
          } else if (block.type === 'tool_use') {
            this.wsManager.sendToolUse(block.name, block.input);

            // Exécuter l'outil
            const result = await this.toolExecutor.execute(
              block.name,
              block.input as ToolInput
            );

            this.wsManager.sendToolResult(block.name, result);

            // Ajouter le résultat à la conversation
            this.brain.addToolResult(block.id, JSON.stringify(result));

            // Vérifier si un redémarrage est nécessaire
            if (result.needsRestart) {
              this.wsManager.sendSystem('Redémarrage du serveur en cours...');
            }
          }
        }

        // Continuer la conversation
        response = await this.brain.continueAfterTool(tools);
      }

      // Traiter la réponse finale
      for (const block of response.content) {
        if (block.type === 'text') {
          this.wsManager.sendBotMessage(block.text);
        }
      }
    } catch (error) {
      console.error('[Server] Erreur:', error);
      this.wsManager.sendError(`Erreur: ${(error as Error).message}`);
    } finally {
      this.isProcessing = false;
      this.wsManager.sendBotTyping(false);
    }
  }

  // Démarrer une nouvelle conversation (premier contact)
  async startConversation(): Promise<void> {
    if (!this.brain) {
      this.wsManager.sendError('Brain non initialisé');
      return;
    }

    const memory = getMemory();
    const isNew = this.brain.isNewSession();

    if (!isNew) {
      // Reprendre la session existante
      this.brain.loadHistory();
      this.wsManager.sendSystem('Session précédente restaurée');
      return;
    }

    // Première conversation - le bot se présente
    const introMessage = `C'est notre première rencontre. Je viens de démarrer.

Je suis DangerousBot, un programme IA qui peut évoluer et s'adapter.

Je vais commencer par poser quelques questions pour mieux te connaître et comprendre ce que tu attends de moi.`;

    await this.processMessage(introMessage);
  }

  // Obtenir le WebSocket manager
  getWSManager(): WebSocketManager {
    return this.wsManager;
  }

  // Démarrer le serveur
  start(port: number, host: string = 'localhost'): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, host, () => {
        console.log(`[Server] DangerousBot écoute sur http://${host}:${port}`);
        resolve();
      });
    });
  }

  // Arrêter le serveur
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wsManager.close();
      this.server.close(() => {
        console.log('[Server] Serveur arrêté');
        resolve();
      });
    });
  }
}
