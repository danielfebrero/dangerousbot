/**
 * Types pour l'intégration Telegram
 */

import { Message } from '../core/types';

export interface TelegramConfig {
  /** Token API du bot */
  token: string;
  /** Activer le polling (dev) ou webhook (prod) */
  usePolling: boolean;
  /** URL webhook (si usePolling = false) */
  webhookUrl?: string;
}

export interface TelegramMessage {
  chatId: number;
  userId: number;
  text?: string;
  photoUrl?: string;
  documentUrl?: string;
  documentName?: string;
  timestamp: Date;
}

export interface TelegramSession {
  userId: number;
  chatId: number;
  conversationId: string;
  lastActivity: Date;
}

export type TelegramCommand = 
  | '/start'
  | '/status'
  | '/web'
  | '/clear'
  | '/provider'
  | '/help';
