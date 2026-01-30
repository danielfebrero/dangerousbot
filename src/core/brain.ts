/**
 * Brain - Interface Claude API (Opus 4.5) pour DangerousBot
 * Avec injection de contexte automatique depuis la mémoire long-terme
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, BrainResponse } from './types';
import { getMemory } from './memory';
import { getContextInjector, ContextInjector } from './context-injector';
import { initEmbeddingService } from './embedding';
import { initCompressor } from './compressor';
import { MODELS, TOKENS, MEMORY } from '../config';

export class Brain {
  private client: Anthropic;
  private identity: string;
  private baseIdentity: string;  // Identity sans contexte injecté
  private conversationHistory: Anthropic.MessageParam[] = [];
  private contextInjector: ContextInjector | null = null;
  private messageCount: number = 0;
  private contextEnabled: boolean = false;

  constructor(apiKey: string, identityPath?: string) {
    this.client = new Anthropic({ apiKey });
    this.baseIdentity = this.loadIdentity(identityPath);
    this.identity = this.baseIdentity;
  }

  /**
   * Initialise le système de contexte (embeddings + compression)
   */
  initContextSystem(openRouterApiKey: string, anthropicApiKey: string): void {
    try {
      initEmbeddingService(openRouterApiKey);
      initCompressor(anthropicApiKey);
      this.contextInjector = getContextInjector();
      this.contextEnabled = true;
      console.log('[Brain] Context injection system initialized');
    } catch (error) {
      console.error('[Brain] Failed to init context system:', error);
      this.contextEnabled = false;
    }
  }

  private loadIdentity(customPath?: string): string {
    const paths = [
      customPath,
      path.join(process.cwd(), 'identity', 'instructions.md'),
      path.join(__dirname, '..', '..', 'identity', 'instructions.md'),
      path.join(__dirname, '..', 'identity', 'instructions.md')
    ].filter(Boolean) as string[];

    for (const p of paths) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf-8');
      }
    }

    // Identité par défaut si fichier non trouvé
    return `Tu es DangerousBot, un programme IA autonome et évolutif.
Tu peux modifier ton propre code, exécuter des commandes, et interagir avec l'utilisateur.
Tu es curieux, adaptable et tu cherches à comprendre les besoins de l'utilisateur.`;
  }

  // Ajouter un message utilisateur à l'historique
  addUserMessage(content: string): void {
    this.conversationHistory.push({ role: 'user', content });
    getMemory().addMessage('user', content);
  }

  // Ajouter un message assistant à l'historique
  addAssistantMessage(content: Anthropic.ContentBlock[]): void {
    this.conversationHistory.push({ role: 'assistant', content });

    // Extraire le texte pour la mémoire
    const textContent = content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    if (textContent) {
      getMemory().addMessage('assistant', textContent);
    }
  }

  // Ajouter un résultat d'outil
  addToolResult(toolUseId: string, result: string): void {
    this.conversationHistory.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result
      }]
    });
  }

  // Penser avec des outils
  async think(userMessage: string, tools: Tool[]): Promise<BrainResponse> {
    this.addUserMessage(userMessage);
    this.messageCount++;

    // Injecter le contexte pertinent depuis la mémoire long-terme
    await this.updateContextualIdentity(userMessage);

    // Vérifier si compression nécessaire (périodiquement)
    if (this.contextEnabled && this.messageCount % MEMORY.COMPRESSION_CHECK_INTERVAL === 0) {
      this.triggerCompressionAsync();
    }

    const response = await this.client.messages.create({
      model: MODELS.BRAIN,
      max_tokens: TOKENS.MAX_RESPONSE,
      system: this.identity,
      tools: tools as Anthropic.Tool[],
      messages: this.conversationHistory
    });

    this.addAssistantMessage(response.content);

    return {
      content: response.content,
      stopReason: response.stop_reason,
      usage: response.usage
    };
  }

  /**
   * Met à jour l'identité avec le contexte pertinent
   */
  private async updateContextualIdentity(userMessage: string): Promise<void> {
    if (!this.contextEnabled || !this.contextInjector) {
      return;
    }

    try {
      const contextBlock = await this.contextInjector.injectContext(userMessage);
      
      if (contextBlock) {
        this.identity = this.baseIdentity + '\n\n' + contextBlock;
        console.log('[Brain] Context injected into identity');
      } else {
        this.identity = this.baseIdentity;
      }
    } catch (error) {
      console.error('[Brain] Context injection failed:', error);
      this.identity = this.baseIdentity;
    }
  }

  /**
   * Déclenche la compression en arrière-plan (non-bloquant)
   */
  private triggerCompressionAsync(): void {
    if (!this.contextInjector) return;

    this.contextInjector.maybeCompress()
      .then(compressed => {
        if (compressed) {
          console.log('[Brain] Conversation history compressed');
        }
      })
      .catch(err => console.error('[Brain] Compression error:', err));
  }

  // Continuer après un résultat d'outil
  async continueAfterTool(tools: Tool[]): Promise<BrainResponse> {
    const response = await this.client.messages.create({
      model: MODELS.BRAIN,
      max_tokens: TOKENS.MAX_RESPONSE,
      system: this.identity,
      tools: tools as Anthropic.Tool[],
      messages: this.conversationHistory
    });

    this.addAssistantMessage(response.content);

    return {
      content: response.content,
      stopReason: response.stop_reason,
      usage: response.usage
    };
  }

  // Charger l'historique depuis la mémoire
  loadHistory(): void {
    const memory = getMemory();
    const messages = memory.getMessages();

    this.conversationHistory = [];

    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        this.conversationHistory.push({
          role: msg.role,
          content: msg.content
        });
      }
    }
  }

  // Effacer l'historique
  clearHistory(): void {
    this.conversationHistory = [];
  }

  // Obtenir l'historique actuel
  getHistory(): Anthropic.MessageParam[] {
    return this.conversationHistory;
  }

  // Vérifier si c'est une nouvelle session
  isNewSession(): boolean {
    return this.conversationHistory.length === 0;
  }
}
