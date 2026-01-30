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
import { Lifecycle } from '../core/lifecycle.js';
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
  private isProcessing: boolean = false;
  private lifecycle: Lifecycle;
  private pendingContinuationMessage: string | null = null;

  constructor(config: ServerConfig, projectRoot: string) {
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
  initBrain(apiKey: string, openRouterApiKey?: string): void {
    this.brain = new Brain(apiKey);
    console.log('[Server] Brain initialisé');

    // Initialiser le système de contexte si la clé OpenRouter est fournie
    if (openRouterApiKey) {
      this.brain.initContextSystem(openRouterApiKey, apiKey);
      console.log('[Server] Système de contexte (embeddings) initialisé');
    }
  }

  // Traiter un message utilisateur (avec support multi-modal)
  async processMessage(userMessage: string, images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>): Promise<void> {
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

    // ✅ SAUVEGARDER LE MESSAGE UTILISATEUR IMMÉDIATEMENT
    const memory = getMemory();
    memory.addMessage('user', userMessage);

    // Collecter tous les tool_calls pour cette réponse
    const allToolCalls: Array<{ name: string; input: unknown }> = [];

    try {
      const tools = getToolDefinitions();
      let response = await this.brain.think(userMessage, tools);

      // Vérifier si un fallback de provider a eu lieu
      const providerSwitched = (global as any).__providerSwitched;
      if (providerSwitched) {
        delete (global as any).__providerSwitched;
        const switchMessage = `⚠️ Provider ${providerSwitched.from} indisponible (${providerSwitched.reason}). Basculé sur ${providerSwitched.to}.`;
        this.wsManager.sendProviderSwitch(providerSwitched.from, providerSwitched.to, providerSwitched.reason);
        memory.addMessage('system', switchMessage);
      }

      // Boucle de traitement des outils
      while (response.stopReason === 'tool_use') {
        for (const block of response.content) {
          if (block.type === 'text') {
            this.wsManager.sendBotMessage(block.text);
          } else if (block.type === 'tool_use') {
            // Collecter le tool_call
            allToolCalls.push({ name: block.name, input: block.input });
            
            this.wsManager.sendToolUse(block.name, block.input);

            // Exécuter l'outil
            const result = await this.toolExecutor.execute(
              block.name,
              block.input as ToolInput
            );

            this.wsManager.sendToolResult(block.name, result);

            // Vérifier si le résultat contient une image (pour les modèles multimodaux)
            if (result.type === 'image' && result.source) {
              // Pour les images, ajouter comme message user avec l'image au lieu de tool_result
              // Cela permet au modèle de "voir" l'image
              this.brain.addUserMessage(`Image chargée depuis ${block.input.path || 'fichier'}`, [{
                type: 'image',
                source: result.source
              }]);
            } else {
              // Ajouter le résultat normal à la conversation
              this.brain.addToolResult(block.id, JSON.stringify(result));
            }

            // Vérifier si un redémarrage est nécessaire
            if (result.needsRestart) {
              this.wsManager.sendSystem('Redémarrage du serveur en cours...');
            }

            // Vérifier si un changement de provider est demandé
            const pendingProviderSwitch = (global as any).__pendingProviderSwitch;
            if (pendingProviderSwitch) {
              delete (global as any).__pendingProviderSwitch;
              const previousProvider = this.brain.getCurrentProvider().name;
              this.brain.switchProvider(pendingProviderSwitch);
              const switchMessage = `🔄 Provider changé: ${previousProvider} → ${pendingProviderSwitch}`;
              this.wsManager.sendProviderSwitch(previousProvider, pendingProviderSwitch, 'user_request');
              memory.addMessage('system', switchMessage);
            }
          }
        }

        // Continuer la conversation
        response = await this.brain.continueAfterTool(tools);
      }

      // Traiter la réponse finale
      let finalText = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          finalText += block.text;
          this.wsManager.sendBotMessage(block.text);
        }
      }

      // Sauvegarder le message assistant avec les tool_calls
      if (finalText || allToolCalls.length > 0) {
        memory.addMessage('assistant', finalText, allToolCalls.length > 0 ? allToolCalls : undefined);
      }

      // Envoyer les stats d'usage des tokens et du coût
      if (response.usage) {
        this.wsManager.sendUsage(
          response.usage.input_tokens, 
          response.usage.output_tokens,
          response.cost
        );
      }

      // Vérifier si un restart est en attente
      const pendingRestart = (global as any).__pendingRestart;
      if (pendingRestart) {
        delete (global as any).__pendingRestart;
        console.log(`[Server] Restart programmé: ${pendingRestart.reason}`);
        this.wsManager.sendSystem(`Redémarrage dans 2 secondes: ${pendingRestart.reason}`);
        
        // Attendre un peu pour s'assurer que tout est sauvegardé
        setTimeout(() => {
          this.lifecycle.restart(pendingRestart.reason);
        }, 2000);
      }
    } catch (error) {
      console.error('[Server] Erreur:', error);
      this.wsManager.sendError(`Erreur: ${(error as Error).message}`);
    } finally {
      this.isProcessing = false;
      this.wsManager.sendBotTyping(false);
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
      console.log(`[Server] Historique chargé: ${messages.length} messages`);
    }
  }

  // Obtenir le WebSocket manager
  getWSManager(): WebSocketManager {
    return this.wsManager;
  }

  // Démarrer le serveur
  start(port: number, host: string = 'localhost'): Promise<void> {
    // Vérifier si on vient de redémarrer
    const restartInfo = this.lifecycle.checkRestarted();
    if (restartInfo.restarted) {
      this.pendingContinuationMessage = `🔄 Redémarrage effectué ! Je suis de retour et prêt à continuer.\n\n_(Provider actif: **${this.brain?.getCurrentProvider().name || 'inconnu'}**)_`;
      console.log('[Server] Message de continuation en attente (redémarrage détecté)');
    }

    return new Promise((resolve) => {
      this.server.listen(port, host, () => {
        console.log(`[Server] DangerousBot écoute sur http://${host}:${port}`);
        resolve();
      });
    });
  }

  // Envoyer le message de continuation après redémarrage
  sendContinuationMessage(): void {
    if (this.pendingContinuationMessage) {
      // Attendre que le WebSocket soit prêt
      setTimeout(() => {
        this.wsManager.sendBotMessage(this.pendingContinuationMessage!);
        this.pendingContinuationMessage = null;
        this.lifecycle.clearRestarted();
        console.log('[Server] Message de continuation envoyé');
      }, 500);
    }
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
