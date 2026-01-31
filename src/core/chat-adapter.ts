/**
 * ChatAdapter - Interface commune pour les différentes sources de chat
 * Permet d'unifier le traitement des messages entre webapp et Telegram
 */

import { ToolCall } from './types.js';

/** Source du message */
export type ChatSource = 'webapp' | 'telegram';

/** Image attachée au message */
export interface ChatImage {
  data: string;      // Base64 data (sans le préfixe data:...)
  mimeType: string;  // ex: 'image/jpeg'
}

/** Contenu d'un message entrant */
export interface IncomingMessage {
  text: string;
  images?: ChatImage[];
}

/** Callbacks pour les événements de traitement */
export interface ProcessingCallbacks {
  /** Appelé quand des tools sont exécutés */
  onToolsExecuted?: (tools: Array<{ name: string; success: boolean }>) => void | Promise<void>;

  /** Appelé pour envoyer du texte en streaming */
  onTextChunk?: (chunk: string) => void | Promise<void>;

  /** Appelé quand le traitement commence */
  onProcessingStart?: () => void | Promise<void>;

  /** Appelé quand le traitement se termine */
  onProcessingEnd?: () => void | Promise<void>;
}

/**
 * Interface pour un adaptateur de chat
 * Chaque source (webapp, telegram, etc.) implémente cette interface
 */
export interface ChatAdapter {
  /** Identifiant de la source */
  readonly source: ChatSource;

  /** Envoie un message texte à l'utilisateur */
  sendMessage(text: string): Promise<void>;

  /** Envoie un indicateur de frappe */
  sendTyping(): void | Promise<void>;

  /** Envoie une notification de tools exécutés */
  sendToolNotification?(tools: Array<{ name: string; success: boolean }>): Promise<void>;
}

/**
 * Résultat du traitement d'un message
 */
export interface ProcessingResult {
  /** Texte de la réponse */
  text: string;

  /** Tools exécutés */
  toolCalls: Array<{
    name: string;
    success: boolean;
    result?: unknown;
  }>;

  /** Erreur si le traitement a échoué */
  error?: Error;
}
