/**
 * WebSocket - Communication temps réel pour DangerousBot
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { WSMessage } from '../core/types.js';

export type MessageHandler = (message: string, images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>, abortSignal?: AbortSignal) => Promise<void>;
export type StopHandler = () => void;
export type HistoryMessage = { 
  role: string; 
  content: string; 
  timestamp: string; 
  tool_calls?: Array<{ name: string; input: unknown }>; 
  images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> 
};
export type HistoryProvider = () => HistoryMessage[];

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private messageHandler: MessageHandler | null = null;
  private stopHandler: StopHandler | null = null;
  private historyProvider: HistoryProvider | null = null;

  private onFirstConnection: (() => void) | null = null;
  private hasConnectedClient: boolean = false;
  private abortController: AbortController | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.setupListeners();
  }

  // Configurer un callback pour la première connexion
  setOnFirstConnection(callback: () => void): void {
    this.onFirstConnection = callback;
  }

  // Configurer le handler de messages (appelé une seule fois depuis main.ts)
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // Configurer le handler de stop
  setStopHandler(handler: StopHandler): void {
    this.stopHandler = handler;
  }

  // Créer un nouvel AbortController pour chaque requête
  createAbortController(): AbortController {
    this.abortController = new AbortController();
    return this.abortController;
  }

  // Annuler la requête en cours
  abortRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // Extraire les images d'un message reçu
  private extractImages(payload: any): Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> | undefined {
    if (!payload || !payload.images || !Array.isArray(payload.images)) {
      return undefined;
    }
    return payload.images as Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
  }

  // Configurer le provider d'historique
  setHistoryProvider(provider: HistoryProvider): void {
    this.historyProvider = provider;
  }

  private setupListeners(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocket] Client connecté');
      this.clients.add(ws);

      // Appeler le callback pour la première connexion
      if (!this.hasConnectedClient && this.onFirstConnection) {
        this.hasConnectedClient = true;
        this.onFirstConnection();
      }

      // Envoyer un message de bienvenue
      this.sendTo(ws, {
        type: 'connected',
        payload: { message: 'Connexion établie avec DangerousBot' }
      });

      // Envoyer l'historique si un provider est configuré
      if (this.historyProvider) {
        const history = this.historyProvider();
        this.sendHistory(ws, history);
        console.log(`[WebSocket] Historique envoyé: ${history.length} messages`);
      }

      // Handler de messages entrants
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'user_message' && this.messageHandler) {
            const text = message.payload?.text || '';
            const images = message.payload?.images;
            const abortController = this.createAbortController();
            await this.messageHandler(text, images, abortController.signal);
          } else if (message.type === 'stop') {
            console.log('[WebSocket] Stop signal received');
            this.abortRequest();
            if (this.stopHandler) {
              this.stopHandler();
            }
          }
        } catch (error) {
          console.error('[WebSocket] Erreur de parsing message:', error);
        }
      });

      ws.on('close', () => {
        console.log('[WebSocket] Client déconnecté');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Erreur:', error);
        this.clients.delete(ws);
      });
    });
  }

  // Envoyer à un client spécifique
  sendTo(client: WebSocket, message: WSMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        ...message,
        timestamp: message.timestamp || new Date().toISOString()
      }));
    }
  }

  // Broadcast à tous les clients
  broadcast(message: WSMessage): void {
    const payload = JSON.stringify({
      ...message,
      timestamp: message.timestamp || new Date().toISOString()
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  // Envoyer un message du bot
  sendBotMessage(text: string): void {
    this.broadcast({
      type: 'bot_message',
      payload: { text }
    });
  }

  // Envoyer un chunk de streaming
  sendStreamChunk(text: string): void {
    this.broadcast({
      type: 'stream_chunk',
      payload: { text }
    });
  }

  // Indiquer que le bot réfléchit
  sendBotTyping(isTyping: boolean): void {
    this.broadcast({
      type: 'bot_typing',
      payload: { isTyping }
    });
  }

  // Envoyer une notification d'utilisation d'outil
  sendToolUse(toolName: string, input: unknown): void {
    this.broadcast({
      type: 'tool_use',
      payload: { tool: toolName, input }
    });
  }

  // Envoyer le résultat d'un outil
  sendToolResult(toolName: string, result: unknown): void {
    this.broadcast({
      type: 'tool_result',
      payload: { tool: toolName, result }
    });
  }

  // Envoyer une notification de redémarrage du serveur
  sendRestartSignal(reason: string): void {
    this.broadcast({
      type: 'restart_signal',
      payload: { reason, message: 'Le serveur va redémarrer. Rechargement automatique dans quelques secondes...' }
    });
  }

  // Envoyer un message système
  sendSystem(message: string): void {
    this.broadcast({
      type: 'system',
      payload: { message }
    });
  }

  // Envoyer une erreur
  sendError(error: string): void {
    this.broadcast({
      type: 'error',
      payload: { error }
    });
  }

  // Envoyer les stats d'usage des tokens et du coût
  sendUsage(inputTokens: number, outputTokens: number, cost?: { input_cost: number; output_cost: number; total_cost: number }): void {
    this.broadcast({
      type: 'usage',
      payload: { 
        input_tokens: inputTokens, 
        output_tokens: outputTokens,
        cost: cost || {
          input_cost: 0,
          output_cost: 0,
          total_cost: 0
        }
      }
    });
  }

  // Envoyer une notification de changement de provider
  sendProviderSwitch(from: string, to: string, reason: string): void {
    this.broadcast({
      type: 'provider_switch',
      payload: { from, to, reason }
    });
  }

  // Envoyer l'historique des messages à un client
  sendHistory(client: WebSocket, messages: HistoryMessage[]): void {
    this.sendTo(client, {
      type: 'history',
      payload: { messages }
    });
  }

  // Obtenir le nombre de clients connectés
  getClientCount(): number {
    return this.clients.size;
  }

  // Fermer toutes les connexions
  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.wss.close();
  }
}
