/**
 * TelegramBot - Intégration complète Telegram pour DangerousBot
 * 
 * Features:
 * - Messages texte synchronisés avec le web
 * - Photos et documents
 * - Tool calls visuels
 * - Commandes (/start, /status, etc.)
 * - Auth sécurisée (whitelist)
 */

import TelegramBot from 'node-telegram-bot-api';
import { EventEmitter } from 'events';
import { TelegramConfig, TelegramMessage, TelegramCommand } from './types.js';
import { Message as CoreMessage, ToolCall, ImageContent } from '../core/types.js';
import { getMemory } from '../core/memory.js';
import { getContextInjector } from '../core/context-injector.js';
import { PROVIDER, MODELS } from '../config';
import { ProviderManager } from '../core/brain/provider-manager.js';
import { getToolDefinitions, Tool } from '../core/tools';

export class TelegramBotService extends EventEmitter {
  private bot: TelegramBot | null = null;
  private config: TelegramConfig;
  private sessions: Map<number, string> = new Map(); // userId -> conversationId
  private userChatMap: Map<number, number> = new Map(); // userId -> chatId

  constructor(config: TelegramConfig) {
    super();
    this.config = config;
  }

  /**
   * Démarre le bot
   */
  async start(): Promise<void> {
    if (this.config.usePolling) {
      this.bot = new TelegramBot(this.config.token, { polling: true });
      console.log('[Telegram] Bot started with polling mode');
    } else {
      this.bot = new TelegramBot(this.config.token);
      // Webhook setup would go here
      console.log('[Telegram] Bot started with webhook mode');
    }

    this.setupHandlers();
  }

  /**
   * Arrête le bot
   */
  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stopPolling();
      this.bot = null;
      console.log('[Telegram] Bot stopped');
    }
  }

  /**
   * Vérifie si l'utilisateur est autorisé (lit depuis la DB)
   * Un seul master user possible
   */
  private isAuthorized(userId: number, username?: string): boolean {
    const memory = getMemory();
    const master = memory.getTelegramMaster();
    
    if (!master) {
      return false; // Pas de master défini = personne n'est autorisé
    }
    
    // Vérifier par ID numérique
    if (master.user_id !== null && userId === master.user_id) {
      return true;
    }
    
    // Vérifier par username (sans le @)
    if (master.username && username) {
      const cleanMasterUsername = master.username.toLowerCase().replace(/^@/, '');
      const cleanUserUsername = username.toLowerCase().replace(/^@/, '');
      if (cleanUserUsername === cleanMasterUsername) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Configure les handlers de messages
   */
  private setupHandlers(): void {
    if (!this.bot) return;

    // Message texte
    this.bot.on('message', async (msg) => {
      const userId = msg.from?.id;
      const username = msg.from?.username;
      if (!userId || !this.isAuthorized(userId, username)) {
        if (userId) {
          this.bot?.sendMessage(msg.chat.id, '⛔ Vous n\'êtes pas autorisé à utiliser ce bot.');
        }
        return;
      }

      await this.handleMessage(msg);
    });

    // Commandes
    this.bot.onText(/\/start/, (msg) => this.handleCommand(msg, '/start'));
    this.bot.onText(/\/status/, (msg) => this.handleCommand(msg, '/status'));
    this.bot.onText(/\/web/, (msg) => this.handleCommand(msg, '/web'));
    this.bot.onText(/\/clear/, (msg) => this.handleCommand(msg, '/clear'));
    this.bot.onText(/\/provider/, (msg) => this.handleCommand(msg, '/provider'));
    this.bot.onText(/\/help/, (msg) => this.handleCommand(msg, '/help'));
  }

  /**
   * Traite un message entrant
   */
  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    if (!this.bot) return;

    const chatId = msg.chat.id;
    const userId = msg.from!.id;

    // Stocker le mapping userId -> chatId pour pouvoir envoyer des messages plus tard
    this.userChatMap.set(userId, chatId);

    // Message de typing
    this.bot.sendChatAction(chatId, 'typing');

    try {
      // Extraire le contenu du message
      let content = '';
      let images: Array<{ url: string; mimeType: string }> = [];

      // Texte
      if (msg.text) {
        content = msg.text;
      }

      // Photo (prend la plus grande résolution)
      if (msg.photo && msg.photo.length > 0) {
        const photo = msg.photo[msg.photo.length - 1];
        const fileUrl = await this.bot.getFileLink(photo.file_id);
        
        // Télécharger et convertir en base64
        try {
          const base64Data = await this.downloadImageAsBase64(fileUrl);
          images.push({ url: base64Data, mimeType: 'image/jpeg' });
          content = content || '[Image]'; // Placeholder si pas de texte
        } catch (e) {
          console.error('[Telegram] Failed to download image:', e);
        }
      }

      // Document
      if (msg.document) {
        const fileUrl = await this.bot.getFileLink(msg.document.file_id);
        content = content || `[Document: ${msg.document.file_name}]`;
      }

      if (!content) {
        await this.bot.sendMessage(chatId, '❓ Je ne comprends pas ce type de message.');
        return;
      }

      // Sauvegarder le message utilisateur
      const memory = getMemory();
      const conversationId = this.getOrCreateSession(userId, chatId);

      // Sauvegarder dans la session courante
      memory.addMessage('user', content);

      // Récupérer l'historique (20 derniers messages)
      const history = memory.getMessages(conversationId, 20);

      // Injecter le contexte
      const injector = getContextInjector();
      const contextBlock = await injector.injectContext(content);

      // Construire les messages pour le provider
      const messages = [
        { role: 'system' as const, content: contextBlock || 'Tu es DangerousBot, un assistant IA autonome.' },
        ...history.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
        { role: 'user' as const, content }
      ];

      // Appeler le ProviderManager pour traiter le message
      const providerManager = new ProviderManager({
        anthropic: this.config.anthropicApiKey || '',
        kimi: this.config.kimiApiKey,
        openRouter: this.config.openRouterApiKey
      });

      // Préparer les tools
      const tools = getToolDefinitions();

      // Envoyer une réponse "typing" en attendant
      await this.bot.sendMessage(chatId, '💬 Je réfléchis...');

      // Appeler le provider
      const response = await providerManager.chatWithFallback(messages, {
        system: contextBlock || 'Tu es DangerousBot, un assistant IA autonome.',
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema
        }))
      });

      // Traiter la réponse
      let responseText = '';
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>
          });
        }
      }

      // Exécuter les tool calls si présents
      if (toolCalls.length > 0) {
        const toolResults = [];
        
        for (const tc of toolCalls) {
          // Import dynamique des handlers
          const { getToolHandler } = await import('../core/tools/index.js');
          const handler = getToolHandler(tc.name);
          
          if (handler) {
            try {
              const result = await handler.execute(tc.arguments, {});
              toolResults.push({
                id: tc.id,
                name: tc.name,
                result
              });
            } catch (e) {
              toolResults.push({
                id: tc.id,
                name: tc.name,
                result: { success: false, error: (e as Error).message }
              });
            }
          }
        }

        // Renvoyer les résultats au provider pour continuation
        messages.push({
          role: 'assistant',
          content: response.content
        });

        for (const tr of toolResults) {
          messages.push({
            role: 'user',
            content: JSON.stringify({ tool_result: tr })
          });
        }

        const continuation = await providerManager.chatWithFallback(messages, {
          system: contextBlock || 'Tu es DangerousBot, un assistant IA autonome.',
          tools: []
        });

        // Extraire le texte de la continuation
        for (const block of continuation.content) {
          if (block.type === 'text') {
            responseText += block.text;
          }
        }
      }

      // Sauvegarder la réponse
      memory.addMessage('assistant', responseText);

      // Envoyer la réponse à Telegram
      await this.sendResponse(chatId, responseText, toolCalls);

    } catch (error) {
      console.error('[Telegram] Error handling message:', error);
      await this.bot.sendMessage(chatId, '❌ Une erreur s\'est produite. Veuillez réessayer.');
    }
  }

  /**
   * Envoie une réponse formatée
   */
  private async sendResponse(
    chatId: number,
    content: string,
    toolCalls?: ToolCall[]
  ): Promise<void> {
    if (!this.bot) return;

    // Découper si trop long (limite Telegram: 4096 caractères)
    const maxLength = 4000;
    const parts = this.splitMessage(content, maxLength);

    for (let i = 0; i < parts.length; i++) {
      let text = parts[i];

      // Ajouter les tool calls à la fin du dernier message
      if (i === parts.length - 1 && toolCalls && toolCalls.length > 0) {
        const toolText = this.formatToolCalls(toolCalls);
        if (text.length + toolText.length < maxLength) {
          text += toolText;
        }
      }

      await this.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    }

    // Si les tool calls sont trop longs, les envoyer séparément
    if (toolCalls && toolCalls.length > 0) {
      const toolText = this.formatToolCalls(toolCalls);
      if (toolText.length > 1000) {
        await this.bot.sendMessage(chatId, toolText, {
          parse_mode: 'Markdown',
        });
      }
    }
  }

  /**
   * Formate les tool calls pour Telegram
   */
  private formatToolCalls(toolCalls: ToolCall[]): string {
    return '\n\n🔧 *Actions exécutées:*\n' +
      toolCalls.map(tc => {
        const args = Object.entries(tc.arguments || {})
          .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 50)}`)
          .join(', ');
        return `• \`${tc.name}\` (${args})`;
      }).join('\n');
  }

  /**
   * Découpe un message trop long
   */
  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const parts: string[] = [];
    let current = '';

    const lines = text.split('\n');
    for (const line of lines) {
      if (current.length + line.length + 1 > maxLength) {
        parts.push(current);
        current = line;
      } else {
        current += (current ? '\n' : '') + line;
      }
    }

    if (current) parts.push(current);
    return parts;
  }

  /**
   * Gère les commandes
   */
  private async handleCommand(
    msg: TelegramBot.Message,
    command: TelegramCommand
  ): Promise<void> {
    if (!this.bot) return;

    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const username = msg.from?.username;

    if (!userId || !this.isAuthorized(userId, username)) {
      await this.bot.sendMessage(chatId, '⛔ Non autorisé.');
      return;
    }

    switch (command) {
      case '/start':
        await this.bot.sendMessage(
          chatId,
          '🤖 *DangerousBot*\n\n' +
          'Je suis ton assistant IA auto-modifiable.\n\n' +
          '• Envoi-moi des messages texte\n' +
          '• Partage des photos\n' +
          '• Pose-moi des questions sur ton code\n\n' +
          'Toutes les conversations sont synchronisées avec l\'interface web.',
          { parse_mode: 'Markdown' }
        );
        break;

      case '/status':
        const provider = PROVIDER.ACTIVE;
        const memory = getMemory();
        const history = memory.getMessages();
        const messagesCount = history.length;
        
        await this.bot.sendMessage(
          chatId,
          `📊 *Statut*\n\n` +
          `*Provider:* ${provider}\n` +
          `*Messages:* ${messagesCount}\n` +
          `*Session:* active`,
          { parse_mode: 'Markdown' }
        );
        break;

      case '/web':
        await this.bot.sendMessage(
          chatId,
          '🌐 Interface web:\n\nhttp://localhost:3000',
          { disable_web_page_preview: true }
        );
        break;

      case '/clear':
        const session = this.sessions.get(userId);
        if (session) {
          await getMemory().clearConversation(session);
          this.sessions.delete(userId);
        }
        await this.bot.sendMessage(chatId, '🧹 Conversation effacée.');
        break;

      case '/provider':
        const current = PROVIDER.ACTIVE;
        const other = current === 'claude' ? 'kimi' : 'claude';
        await this.bot.sendMessage(
          chatId,
          `⚙️ Provider actuel: *${current}*\n\n` +
          `Pour changer, utilise l\'interface web ou dis-moi "passe sur ${other}".`,
          { parse_mode: 'Markdown' }
        );
        break;

      case '/help':
        await this.bot.sendMessage(
          chatId,
          '*Commandes disponibles:*\n\n' +
          '/start - Démarrer\n' +
          '/status - Voir le statut\n' +
          '/web - Lien vers l\'interface web\n' +
          '/clear - Effacer la conversation\n' +
          '/provider - Voir le provider actif\n' +
          '/help - Cette aide',
          { parse_mode: 'Markdown' }
        );
        break;
    }
  }

  /**
   * Télécharge une image et la convertit en base64
   */
  private async downloadImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  }

  /**
   * Récupère ou crée une session
   */
  private getOrCreateSession(userId: number, chatId: number): string {
    let conversationId = this.sessions.get(userId);
    if (!conversationId) {
      conversationId = `telegram-${userId}-${Date.now()}`;
      this.sessions.set(userId, conversationId);
    }
    return conversationId;
  }

  /**
   * Récupère l'ID de conversation Telegram
   */
  getTelegramConversationId(userId: number): string | undefined {
    return this.sessions.get(userId);
  }

  /**
   * Envoie un message au master user
   * Retourne true si envoyé, false sinon
   */
  async sendMessageToMaster(message: string): Promise<boolean> {
    if (!this.bot) return false;

    const memory = getMemory();
    const master = memory.getTelegramMaster();
    
    if (!master) {
      console.log('[Telegram] Pas de master user défini');
      return false;
    }

    try {
      // Si on a un user_id, on essaie de trouver le chat_id correspondant
      if (master.user_id) {
        const chatId = this.findChatIdForUser(master.user_id);
        if (chatId) {
          await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
          console.log(`[Telegram] Message envoyé à ${master.user_id}`);
          return true;
        }
      }

      // Si on n'a pas trouvé de chat_id, on ne peut pas envoyer le message
      // L'utilisateur doit d'abord interagir avec le bot
      console.log('[Telegram] Impossible d\'envoyer le message - aucune session active');
      return false;
    } catch (err) {
      console.error('[Telegram] Erreur lors de l\'envoi:', err);
      return false;
    }
  }

  /**
   * Trouve le chat_id pour un user_id donné (si une session existe)
   */
  private findChatIdForUser(userId: number): number | undefined {
    return this.userChatMap.get(userId);
  }

  /**
   * Récupère le chatId d'un user
   */
  getChatIdForUser(userId: number): number | undefined {
    return this.userChatMap.get(userId);
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
