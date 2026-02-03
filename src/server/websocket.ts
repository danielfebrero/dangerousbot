/**
 * WebSocket Manager - Communication temps réel avec support des threads multiples
 *
 * Permet de gérer plusieurs onglets/conversations simultanées
 * Chaque client a son propre thread actif
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { WSMessage } from '../core/types.js';
import { getThreadManager, ThreadManager } from '../core/thread-manager.js';
import { getTokenTracker } from '../core/token-tracker.js';

// Types pour les handlers avec thread awareness
export type ThreadMessageHandler = (
  message: string,
  threadId: string,
  options: {
    images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
    abortSignal?: AbortSignal;
    clientId: string;
    ws: WebSocket;
  }
) => Promise<void>;

export type ThreadStopHandler = (clientId: string, threadId?: string) => void | Promise<void>;

export interface ThreadClient {
  ws: WebSocket;
  threadId: string;
  clientId: string;
  connectedAt: Date;
}

export interface ThreadedHistoryMessage {
  role: string;
  content: string;
  timestamp: string;
  tool_calls?: Array<{ name: string; input: unknown }>;
  images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
  source?: 'webapp' | 'telegram';
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ThreadClient> = new Map();
  private messageHandler: ThreadMessageHandler | null = null;
  private stopHandler: ThreadStopHandler | null = null;
  private threadManager: ThreadManager;
  private abortControllers: Map<string, AbortController> = new Map();

  private onFirstConnection: (() => void) | null = null;
  private hasConnectedClient: boolean = false;

  constructor(server: Server) {
    this.threadManager = getThreadManager();
    this.wss = new WebSocketServer({ server });
    this.setupListeners();
  }

  setOnFirstConnection(callback: () => void): void {
    this.onFirstConnection = callback;
  }

  setMessageHandler(handler: ThreadMessageHandler): void {
    this.messageHandler = handler;
  }

  setStopHandler(handler: ThreadStopHandler): void {
    this.stopHandler = handler;
  }

  private setupListeners(): void {
    this.wss.on('connection', (ws: WebSocket, req: any) => {
      // Génère un client_id unique (mais stable pour ce socket)
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      console.log(`[WebSocket] Client connecté: ${clientId}`);

      // Récupère le thread_id depuis les headers/query params si fourni
      const url = new URL(req.url || '/', 'http://localhost');
      const requestedThreadId = url.searchParams.get('thread_id');

      // Détermine le thread à utiliser - par défaut le main thread
      let threadId: string;
      if (requestedThreadId) {
        const thread = this.threadManager.getThread(requestedThreadId);
        threadId = thread ? thread.id : this.threadManager.getMainThread()?.id || this.threadManager.createThread('Main Conversation', null, true);
      } else {
        // Utilise le main thread par défaut (ou le crée s'il n'existe pas)
        const mainThread = this.threadManager.getMainThread();
        threadId = mainThread?.id || this.threadManager.createThread('Main Conversation', null, true);
      }

      // Enregistre le client
      this.clients.set(ws, {
        ws,
        threadId,
        clientId,
        connectedAt: new Date(),
      });

      // Active ce thread pour ce client
      this.threadManager.setActiveThread(clientId, threadId);

      // Callback première connexion
      if (!this.hasConnectedClient && this.onFirstConnection) {
        this.hasConnectedClient = true;
        this.onFirstConnection();
      }

      // Envoie la confirmation de connexion avec thread_id
      this.sendTo(ws, {
        type: 'connected',
        payload: {
          message: 'Connexion établie avec DangerousBot',
          clientId,
          threadId,
        },
      });

      // Envoie l'historique du thread
      this.sendThreadHistory(ws, threadId);

      // Envoie les stats de tokens initiales (pour afficher le compteur dès la connexion)
      try {
        const tokenTracker = getTokenTracker();
        const initialStats = tokenTracker.getStats(threadId);
        this.sendTo(ws, {
          type: 'token_update',
          payload: initialStats,
          threadId,
        });
      } catch (e) {
        // Token tracker pas encore initialisé, ignorer
      }

      // Handler de messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          const client = this.clients.get(ws);
          if (!client) return;

          switch (message.type) {
            case 'user_message': {
              if (this.messageHandler) {
                const text = message.payload?.text || '';
                const images = message.payload?.images;
                const abortController = this.createAbortController(client.clientId);
                
                await this.messageHandler(text, client.threadId, {
                  images,
                  abortSignal: abortController.signal,
                  clientId: client.clientId,
                  ws,
                });
              }
              break;
            }

            case 'stop': {
              console.log(`[WebSocket] Stop signal received from ${client.clientId}`);
              this.abortRequest(client.clientId);
              if (this.stopHandler) {
                this.stopHandler(client.clientId, client.threadId);
              }
              break;
            }

            case 'switch_thread': {
              const newThreadId = message.payload?.threadId;
              if (newThreadId) {
                await this.switchThread(ws, newThreadId);
              }
              break;
            }

            case 'create_thread': {
              const title = message.payload?.title || 'New Thread';
              const newThreadId = this.threadManager.createThread(title);
              await this.switchThread(ws, newThreadId);
              break;
            }

            case 'create_sub_thread': {
              const parentId = message.payload?.parentThreadId;
              const subTitle = message.payload?.title || 'Sub Thread';
              if (parentId) {
                const newThreadId = this.threadManager.createSubThread(parentId, subTitle);
                await this.switchThread(ws, newThreadId);
              }
              break;
            }

            case 'rename_thread': {
              const renameThreadId = message.payload?.threadId;
              const newTitle = message.payload?.title;
              if (renameThreadId && newTitle) {
                this.threadManager.renameThread(renameThreadId, newTitle);
                this.sendTo(ws, {
                  type: 'thread_renamed',
                  payload: { threadId: renameThreadId, title: newTitle },
                });
              }
              break;
            }

            case 'delete_thread': {
              const deleteThreadId = message.payload?.threadId;
              if (deleteThreadId) {
                this.threadManager.deleteThread(deleteThreadId);
                this.sendTo(ws, {
                  type: 'thread_deleted',
                  payload: { threadId: deleteThreadId },
                });
              }
              break;
            }

            case 'list_threads': {
              const threads = this.threadManager.listThreads(true);
              this.sendTo(ws, {
                type: 'threads_list',
                payload: { threads, activeThreadId: client.threadId },
              });
              break;
            }

            case 'clear_thread': {
              this.threadManager.clearThreadMessages(client.threadId);
              this.sendTo(ws, {
                type: 'thread_cleared',
                payload: { threadId: client.threadId },
              });
              break;
            }

            case 'load_more_history': {
              const offset = message.payload?.offset || 0;
              const limit = message.payload?.limit || 100;
              this.sendThreadHistory(ws, client.threadId, limit, offset);
              break;
            }

            case 'force_restart': {
              const reason = message.payload?.reason || 'Force restart par l\'utilisateur';
              console.log(`[WebSocket] Force restart demandé par ${client.clientId}: ${reason}`);
              
              // Vider la liste des clients busy
              const busyThreads = (global as any).__busyThreads;
              if (busyThreads) {
                busyThreads.clear();
              }
              
              // Relancer le self_update avec force=true
              const selfUpdateResult = await this.handleForceRestart(reason, client.threadId);
              
              this.sendTo(ws, {
                type: 'system',
                payload: { 
                  message: selfUpdateResult.success 
                    ? '✅ Redémarrage forcé initié...'
                    : `❌ Erreur: ${selfUpdateResult.error}` 
                },
              });
              break;
            }

            default:
              console.warn(`[WebSocket] Unknown message type: ${message.type}`);
          }
        } catch (error) {
          console.error('[WebSocket] Erreur de parsing message:', error);
        }
      });

      ws.on('close', () => {
        const client = this.clients.get(ws);
        if (client) {
          console.log(`[WebSocket] Client déconnecté: ${client.clientId}`);
          this.threadManager.releaseClient(client.clientId);
          this.abortControllers.delete(client.clientId);
        }
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Erreur:', error);
        const client = this.clients.get(ws);
        if (client) {
          this.threadManager.releaseClient(client.clientId);
        }
        this.clients.delete(ws);
      });
    });
  }

  private async switchThread(ws: WebSocket, newThreadId: string): Promise<void> {
    const client = this.clients.get(ws);
    if (!client) return;

    const thread = this.threadManager.getThread(newThreadId);
    if (!thread) {
      this.sendTo(ws, {
        type: 'error',
        payload: { error: `Thread ${newThreadId} not found` },
      });
      return;
    }

    // Met à jour le thread du client
    client.threadId = newThreadId;
    this.threadManager.setActiveThread(client.clientId, newThreadId);

    // Envoie la confirmation
    this.sendTo(ws, {
      type: 'thread_switched',
      payload: {
        threadId: newThreadId,
        title: thread.title,
      },
    });

    // Envoie l'historique du nouveau thread
    this.sendThreadHistory(ws, newThreadId);

    // Envoie les stats de tokens du nouveau thread
    try {
      const tokenTracker = getTokenTracker();
      const stats = tokenTracker.getStats(newThreadId);
      this.sendTo(ws, {
        type: 'token_update',
        payload: stats,
        threadId: newThreadId,
      });
    } catch (e) {
      // Token tracker pas encore initialisé, ignorer
    }
  }

  private sendThreadHistory(ws: WebSocket, threadId: string, limit: number = 100, offset: number = 0): void {
    const allMessages = this.threadManager.getThreadMessages(threadId, limit, offset);
    // Filter out internal __TOOL_RESULT__ messages (used for AI context reconstruction only)
    const messages = allMessages.filter(msg =>
      !(msg.role === 'user' && typeof msg.content === 'string' && msg.content.startsWith('__TOOL_RESULT__'))
    );
    const totalCount = this.threadManager.getThreadMessageCount(threadId);
    const hasMore = offset + allMessages.length < totalCount;

    this.sendTo(ws, {
      type: 'history',
      payload: { messages, threadId, hasMore, totalCount, offset },
    });
    console.log(`[WebSocket] Historique envoyé pour thread ${threadId}: ${messages.length} messages (${allMessages.length - messages.length} tool results filtrés, offset: ${offset}, total: ${totalCount})`);
  }

  private createAbortController(clientId: string): AbortController {
    // Annule l'ancien s'il existe
    this.abortRequest(clientId);
    
    const controller = new AbortController();
    this.abortControllers.set(clientId, controller);
    return controller;
  }

  private abortRequest(clientId: string): void {
    const controller = this.abortControllers.get(clientId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(clientId);
    }
  }

  // Envoyer à un client spécifique
  sendTo(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...message,
        timestamp: message.timestamp || new Date().toISOString(),
      }));
    }
  }

  // Envoyer à un client spécifique par son ID
  sendToClient(clientId: string, message: WSMessage): boolean {
    for (const [ws, client] of this.clients.entries()) {
      if (client.clientId === clientId) {
        this.sendTo(ws, message);
        return true;
      }
    }
    return false;
  }

  // Envoyer à tous les clients d'un thread spécifique
  broadcastToThread(threadId: string, message: WSMessage): void {
    const payload = JSON.stringify({
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    });

    for (const [ws, client] of this.clients.entries()) {
      if (client.threadId === threadId && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  // Broadcast à tous les clients (tous threads)
  broadcast(message: WSMessage): void {
    const payload = JSON.stringify({
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    });

    for (const ws of this.clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  // Helpers pour envoyer des messages spécifiques (avec threadId pour isolation)
  sendBotMessage(threadId: string, text: string): void {
    this.broadcastToThread(threadId, {
      type: 'bot_message',
      payload: { text },
      threadId,
    });
  }

  sendStreamChunk(threadId: string, text: string): void {
    this.broadcastToThread(threadId, {
      type: 'stream_chunk',
      payload: { text },
      threadId,
    });
  }

  sendBotTyping(threadId: string, isTyping: boolean): void {
    this.broadcastToThread(threadId, {
      type: 'bot_typing',
      payload: { isTyping },
      threadId,
    });
  }

  sendToolUse(threadId: string, toolName: string, input: unknown, executionId: string): void {
    this.broadcastToThread(threadId, {
      type: 'tool_use',
      payload: { tool: toolName, input, executionId },
      threadId,
    });
  }

  sendToolResult(threadId: string, toolName: string, result: unknown, executionId: string): void {
    this.broadcastToThread(threadId, {
      type: 'tool_result',
      payload: { tool: toolName, result, executionId },
      threadId,
    });
  }

  sendSystem(threadId: string | null, message: string): void {
    if (threadId) {
      this.broadcastToThread(threadId, {
        type: 'system',
        payload: { message },
        threadId,
      });
    } else {
      this.broadcast({
        type: 'system',
        payload: { message },
      });
    }
  }

  sendError(ws: WebSocket, error: string, threadId?: string): void {
    this.sendTo(ws, {
      type: 'error',
      payload: { error },
      threadId,
    });
  }

  sendUsage(threadId: string, inputTokens: number, outputTokens: number, cost?: { input_cost: number; output_cost: number; total_cost: number }): void {
    this.broadcastToThread(threadId, {
      type: 'usage',
      payload: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost: cost || { input_cost: 0, output_cost: 0, total_cost: 0 },
      },
      threadId,
    });
  }

  /**
   * Envoie une mise à jour des tokens en temps réel
   */
  sendTokenUpdate(
    threadId: string,
    stats: {
      estimatedContextTokens: number;
      sessionInputTokens: number;
      sessionOutputTokens: number;
      sessionTotalCost: number;
      lastRequestInputTokens: number;
      lastRequestOutputTokens: number;
      lastRequestCost: number;
      contextLimit: number;
      contextUsagePercent: number;
    }
  ): void {
    this.broadcastToThread(threadId, {
      type: 'token_update',
      payload: stats,
      threadId,
    });
  }

  sendProviderSwitch(threadId: string, from: string, to: string, reason: string): void {
    this.broadcastToThread(threadId, {
      type: 'provider_switch',
      payload: { from, to, reason },
      threadId,
    });
  }

  sendRestartSignal(reason: string): void {
    this.broadcast({
      type: 'restart_signal',
      payload: {
        reason,
        message: 'Le serveur va redémarrer. Rechargement automatique dans quelques secondes...',
      },
    });
  }

  // Récupère le thread_id actif d'un client
  getClientThreadId(ws: WebSocket): string | null {
    const client = this.clients.get(ws);
    return client ? client.threadId : null;
  }

  // Récupère le client_id d'un socket
  getClientId(ws: WebSocket): string | null {
    const client = this.clients.get(ws);
    return client ? client.clientId : null;
  }

  // Obtenir le nombre de clients connectés
  getClientCount(): number {
    return this.clients.size;
  }

  // Obtenir le nombre de clients par thread
  getThreadClientCount(threadId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.threadId === threadId) count++;
    }
    return count;
  }

  // Gérer le force restart
  private async handleForceRestart(reason: string, threadId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Importer dynamiquement le handler self_update
      const { selfUpdateHandler } = await import('../core/tools/self-update.js');
      const { getRollbackManager } = await import('../core/rollback.js');
      const { getMemory } = await import('../core/memory.js');
      const { getCodeEmbeddingService } = await import('../core/code-embedding.js');
      const { getCodeIndexer } = await import('../core/code-indexer.js');
      const { Versioning } = await import('../core/versioning.js');
      const { Lifecycle } = await import('../core/lifecycle.js');
      
      const rollbackManager = getRollbackManager();
      const memory = getMemory();
      const versioning = new Versioning(process.cwd());
      const lifecycle = new Lifecycle(process.cwd());
      
      const context = {
        projectRoot: process.cwd(),
        executor: { shell: async (cmd: string) => {
          const { execSync } = await import('child_process');
          try {
            execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8' });
            return { success: true };
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        }},
        memory,
        versioning,
        lifecycle,
        mistral: null,
        aiConsultant: null,
        rollbackManager,
      };
      
      const result = await selfUpdateHandler.execute({ reason, force: true }, context);
      
      if (result.success && result.needsRestart) {
        // Programmer le redémarrage
        const fs = await import('fs');
        const path = await import('path');
        const restartFile = path.join(process.cwd(), '.restart');
        fs.writeFileSync(restartFile, JSON.stringify({
          reason,
          timestamp: new Date().toISOString()
        }));
        
        // Stocker le flag pour le serveur
        (global as any).__pendingRestart = { reason };
        
        // Envoyer le signal de redémarrage à tous les clients
        this.sendRestartSignal(reason);
        
        // Redémarrer après un délai
        setTimeout(() => {
          lifecycle.restart(reason);
        }, 2000);
      }
      
      return { success: result.success, error: result.error };
    } catch (error) {
      console.error('[WebSocket] Erreur force restart:', error);
      return { success: false, error: String(error) };
    }
  }

  // Fermer toutes les connexions
  close(): void {
    for (const [ws, client] of this.clients.entries()) {
      this.threadManager.releaseClient(client.clientId);
      ws.close();
    }
    this.clients.clear();
    this.wss.close();
  }
}
