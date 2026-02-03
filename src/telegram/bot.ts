/**
 * TelegramBot - Intégration Telegram pour DangerousBot
 *
 * Architecture refactorisée:
 * - Utilise MessageProcessor pour le traitement des messages
 * - Utilise les modules constants et formatters
 * - Implémente ChatAdapter
 */

import TelegramBot from 'node-telegram-bot-api';
import { EventEmitter } from 'events';
import { TelegramConfig, TelegramCommand } from './types.js';
import { MESSAGES, COMMAND_MESSAGES } from './constants.js';
import { formatToolBadges, splitMessage } from './formatters.js';
import { getMemory } from '../core/memory.js';
import { PROVIDER } from '../config.js';
import { ChatAdapter, ChatSource, ChatImage } from '../core/chat-adapter.js';
import { MessageProcessor, initMessageProcessor } from '../core/message-processor.js';
import { getThreadManager } from '../core/thread-manager.js';

/**
 * Adaptateur Telegram implémentant ChatAdapter
 */
class TelegramChatAdapter implements ChatAdapter {
  readonly source: ChatSource = 'telegram';
  private bot: TelegramBot;
  private chatId: number;

  constructor(bot: TelegramBot, chatId: number) {
    this.bot = bot;
    this.chatId = chatId;
  }

  async sendMessage(text: string): Promise<void> {
    const parts = splitMessage(text);
    for (const part of parts) {
      await this.sendMessageSafe(part);
    }
  }

  sendTyping(): void {
    this.bot.sendChatAction(this.chatId, 'typing');
  }

  async sendToolNotification(tools: Array<{ name: string; success: boolean }>): Promise<void> {
    const message = formatToolBadges(tools);
    await this.sendMessageSafe(message);
  }

  private async sendMessageSafe(text: string): Promise<void> {
    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (error: any) {
      if (error?.response?.body?.description?.includes("can't parse entities")) {
        console.log('[Telegram] Markdown parsing failed, sending as plain text');
        await this.bot.sendMessage(this.chatId, text, {
          disable_web_page_preview: true,
        });
      } else {
        throw error;
      }
    }
  }
}

/**
 * Service principal du bot Telegram
 */
export class TelegramBotService extends EventEmitter {
  private bot: TelegramBot | null = null;
  private config: TelegramConfig;
  private sessions: Map<number, string> = new Map();
  private userChatMap: Map<number, number> = new Map();
  private messageProcessor: MessageProcessor | null = null;

  constructor(config: TelegramConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    // Initialiser le MessageProcessor
    this.messageProcessor = initMessageProcessor({
      anthropicApiKey: this.config.anthropicApiKey,
      kimiApiKey: this.config.kimiApiKey,
      openRouterApiKey: this.config.openRouterApiKey,
    });

    // Démarrer le bot
    if (this.config.usePolling) {
      this.bot = new TelegramBot(this.config.token, { polling: true });
      console.log('[Telegram] Bot started with polling mode');
    } else {
      this.bot = new TelegramBot(this.config.token);
      console.log('[Telegram] Bot started with webhook mode');
    }

    this.setupHandlers();
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stopPolling();
      this.bot = null;
      console.log('[Telegram] Bot stopped');
    }
  }

  private isAuthorized(userId: number, username?: string): boolean {
    const memory = getMemory();
    const master = memory.getTelegramMaster();

    if (!master) return false;

    if (master.user_id !== null && userId === master.user_id) {
      return true;
    }

    if (master.username && username) {
      const cleanMaster = master.username.toLowerCase().replace(/^@/, '');
      const cleanUser = username.toLowerCase().replace(/^@/, '');
      if (cleanUser === cleanMaster) return true;
    }

    return false;
  }

  private setupHandlers(): void {
    if (!this.bot) return;

    this.bot.on('message', async (msg: any) => {
      const userId = msg.from?.id;
      const username = msg.from?.username;

      if (!userId || !this.isAuthorized(userId, username)) {
        if (userId) {
          this.bot?.sendMessage(msg.chat.id, MESSAGES.UNAUTHORIZED);
        }
        return;
      }

      await this.handleMessage(msg);
    });

    // Commandes
    this.bot.onText(/\/start/, (msg: any) => this.handleCommand(msg, '/start'));
    this.bot.onText(/\/status/, (msg: any) => this.handleCommand(msg, '/status'));
    this.bot.onText(/\/web/, (msg: any) => this.handleCommand(msg, '/web'));
    this.bot.onText(/\/provider/, (msg: any) => this.handleCommand(msg, '/provider'));
    this.bot.onText(/\/help/, (msg: any) => this.handleCommand(msg, '/help'));
  }

  private async handleMessage(msg: any): Promise<void> {
    if (!this.bot || !this.messageProcessor) return;

    const chatId = msg.chat.id;
    const userId = msg.from!.id;

    this.userChatMap.set(userId, chatId);

    const adapter = new TelegramChatAdapter(this.bot, chatId);
    
    // Garder l'indicateur "typing" actif pendant tout le traitement
    // L'API Telegram expire après ~5 secondes, donc on renouvelle toutes les 4 secondes
    adapter.sendTyping();
    const typingInterval = setInterval(() => {
      adapter.sendTyping();
    }, 4000);

    try {
      // Extraire le contenu
      const { text, images } = await this.extractMessageContent(msg);

      if (!text) {
        clearInterval(typingInterval); // Arrêter le typing avant d'envoyer
        await adapter.sendMessage(MESSAGES.UNKNOWN_MESSAGE_TYPE);
        return;
      }

      const { conversationId, threadId } = this.getOrCreateSession(userId);

      // Traiter le message avec le thread dédié à cet utilisateur Telegram
      const result = await this.messageProcessor.process(
        { text, images },
        {
          source: 'telegram',
          conversationId,
          threadId,
          historyLimit: 20,
          callbacks: {
            onToolsExecuted: async (tools) => {
              await adapter.sendToolNotification(tools);
            },
            onTextChunk: async (chunk) => {
              // Envoyer immédiatement le texte intermédiaire
              await adapter.sendMessage(chunk);
            },
          },
          platformContext: {
            telegramChatId: String(chatId),
            telegramUserId: userId,
            bot: this.bot,
          },
        }
      );

      // Arrêter l'indicateur typing
      clearInterval(typingInterval);

      if (result.error) {
        console.error('[Telegram] Processing error:', result.error);
        await adapter.sendMessage(MESSAGES.ERROR);
        return;
      }

      // Envoyer le texte final (si non vide et différent des chunks déjà envoyés)
      if (result.text.trim()) {
        await adapter.sendMessage(result.text);
      }
    } catch (error) {
      // Arrêter l'indicateur typing même en cas d'erreur
      clearInterval(typingInterval);
      console.error('[Telegram] Error handling message:', error);
      await adapter.sendMessage(MESSAGES.ERROR);
    }
  }

  private async extractMessageContent(
    msg: any
  ): Promise<{ text: string; images: ChatImage[] }> {
    let text = msg.text || msg.caption || '';
    const images: ChatImage[] = [];

    // Photos
    if (msg.photo && msg.photo.length > 0 && this.bot) {
      const photo = msg.photo[msg.photo.length - 1];
      try {
        const fileUrl = await this.bot.getFileLink(photo.file_id);
        const base64Data = await this.downloadImageAsBase64(fileUrl);
        images.push({
          data: base64Data.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: 'image/jpeg',
        });
        if (!text) text = MESSAGES.IMAGE_PLACEHOLDER;
      } catch (e) {
        console.error('[Telegram] Failed to download image:', e);
      }
    }

    // Documents
    if (msg.document && this.bot) {
      text = text || `[Document: ${msg.document.file_name}]`;
    }

    return { text, images };
  }

  private async handleCommand(msg: any, command: TelegramCommand): Promise<void> {
    if (!this.bot) return;

    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const username = msg.from?.username;

    if (!userId || !this.isAuthorized(userId, username)) {
      await this.bot.sendMessage(chatId, MESSAGES.UNAUTHORIZED);
      return;
    }

    switch (command) {
      case '/start':
        await this.bot.sendMessage(chatId, COMMAND_MESSAGES.START, { parse_mode: 'Markdown' });
        break;

      case '/status':
        const provider = PROVIDER.ACTIVE;
        const memory = getMemory();
        const messagesCount = memory.getMessages().length;
        await this.bot.sendMessage(
          chatId,
          `📊 *Statut*\n\n*Provider:* ${provider}\n*Messages:* ${messagesCount}\n*Session:* active`,
          { parse_mode: 'Markdown' }
        );
        break;

      case '/web':
        await this.bot.sendMessage(chatId, COMMAND_MESSAGES.WEB, { disable_web_page_preview: true });
        break;

      case '/provider':
        const current = PROVIDER.ACTIVE;
        const other = current === 'claude' ? 'kimi' : 'claude';
        await this.bot.sendMessage(
          chatId,
          `⚙️ Provider actuel: *${current}*\n\nPour changer, utilise l'interface web ou dis-moi "passe sur ${other}".`,
          { parse_mode: 'Markdown' }
        );
        break;

      case '/help':
        await this.bot.sendMessage(chatId, COMMAND_MESSAGES.HELP, { parse_mode: 'Markdown' });
        break;
    }
  }

  private async downloadImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`;
  }

  /**
   * Récupère ou crée une session (thread) pour un utilisateur Telegram
   * Utilise le thread persisté en DB si disponible, sinon le main thread
   * Retourne à la fois le conversationId et le threadId
   */
  private getOrCreateSession(userId: number): { conversationId: string; threadId: string } {
    // Utiliser un ID déterministe basé sur le userId pour persister la session
    const conversationId = `telegram-${userId}`;

    const memory = getMemory();
    const threadManager = getThreadManager();

    // 1. Vérifier si un thread actif est sauvegardé pour cet utilisateur
    const savedThreadId = memory.getTelegramActiveThread(userId);
    if (savedThreadId) {
      // Vérifier que le thread existe toujours
      const savedThread = threadManager.getThread(savedThreadId);
      if (savedThread) {
        console.log(`[Telegram] Using persisted thread for user ${userId}: ${savedThreadId}`);
        return { conversationId, threadId: savedThreadId };
      }
      // Thread supprimé, on va créer/utiliser le main thread
      console.log(`[Telegram] Persisted thread ${savedThreadId} not found, using main thread`);
    }

    // 2. Récupérer ou créer un thread main dédié pour cet utilisateur Telegram
    const thread = threadManager.getOrCreateMainThread('telegram', String(userId));

    // 3. Sauvegarder ce thread comme thread actif
    memory.setTelegramActiveThread(userId, thread.id);

    // Stocker l'association si pas déjà fait
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, conversationId);
    }

    return { conversationId, threadId: thread.id };
  }

  /**
   * Change le thread actif pour un utilisateur Telegram et le persiste
   */
  setActiveThread(userId: number, threadId: string): boolean {
    const threadManager = getThreadManager();
    const thread = threadManager.getThread(threadId);
    if (!thread) {
      return false;
    }

    const memory = getMemory();
    memory.setTelegramActiveThread(userId, threadId);
    console.log(`[Telegram] Thread actif changé pour user ${userId}: ${threadId}`);
    return true;
  }

  getTelegramConversationId(userId: number): string | undefined {
    return this.sessions.get(userId);
  }

  getChatIdForUser(userId: number): number | undefined {
    return this.userChatMap.get(userId);
  }

  async sendMessageToMaster(message: string): Promise<boolean> {
    if (!this.bot) return false;

    const memory = getMemory();
    const master = memory.getTelegramMaster();

    if (!master) {
      console.log('[Telegram] Pas de master user défini');
      return false;
    }

    try {
      if (master.user_id) {
        const chatId = this.userChatMap.get(master.user_id);
        if (chatId) {
          await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
          console.log(`[Telegram] Message envoyé à ${master.user_id}`);
          return true;
        }
      }

      console.log('[Telegram] Impossible d\'envoyer le message - aucune session active');
      return false;
    } catch (err) {
      console.error('[Telegram] Erreur lors de l\'envoi:', err);
      return false;
    }
  }
}

// Singleton
let telegramInstance: TelegramBotService | null = null;

export function getTelegramBot(config?: TelegramConfig): TelegramBotService {
  if (!telegramInstance && config) {
    telegramInstance = new TelegramBotService(config);
  }
  if (!telegramInstance) {
    throw new Error('TelegramBot not initialized');
  }
  return telegramInstance;
}

export function initTelegramBot(config: TelegramConfig): TelegramBotService {
  telegramInstance = new TelegramBotService(config);
  return telegramInstance;
}
