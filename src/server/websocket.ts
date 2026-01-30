/**
 * WebSocket - Communication temps réel pour DangerousBot
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { WSMessage } from '../core/types.js';

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.setupListeners();
  }

  private setupListeners(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocket] Client connecté');
      this.clients.add(ws);

      // Envoyer un message de bienvenue
      this.sendTo(ws, {
        type: 'connected',
        payload: { message: 'Connexion établie avec DangerousBot' }
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
