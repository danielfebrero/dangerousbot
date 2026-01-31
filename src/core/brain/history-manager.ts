/**
 * History Manager - Gestion de l'historique de conversation
 */

import { AIMessage, AIContentBlock, ImageContent } from './types.js';
import { getMemory } from '../memory.js';
import { cleanOldToolResults } from '../contextCleaner.js';

export class HistoryManager {
  private conversationHistory: AIMessage[] = [];
  private messageCount: number = 0;

  /**
   * Ajoute un message utilisateur à l'historique (support multi-modal)
   */
  addUserMessage(
    content: string,
    images?: ImageContent[]
  ): void {
    // Ignorer les messages vides sans images
    if (!content?.trim() && (!images || images.length === 0)) {
      console.warn('[HistoryManager] Ignored empty user message');
      return;
    }

    const timestamp = new Date().toISOString();

    if (images && images.length > 0) {
      const contentBlocks: AIContentBlock[] = [];
      if (content?.trim()) {
        contentBlocks.push({ type: 'text', text: content });
      }
      for (const img of images) {
        contentBlocks.push({
          type: 'image',
          source: img.source
        } as AIContentBlock);
      }
      this.conversationHistory.push({ role: 'user', content: contentBlocks, timestamp });
    } else {
      this.conversationHistory.push({ role: 'user', content, timestamp });
    }
    this.messageCount++;
  }

  /**
   * Ajoute un message assistant à l'historique
   */
  addAssistantMessage(content: AIContentBlock[]): void {
    // Ignorer les messages vides
    if (!content || content.length === 0) {
      console.warn('[HistoryManager] Ignored empty assistant message');
      return;
    }
    const timestamp = new Date().toISOString();
    this.conversationHistory.push({ role: 'assistant', content, timestamp });
  }

  /**
   * Ajoute un résultat d'outil
   */
  addToolResult(toolUseId: string, result: string): void {
    const timestamp = new Date().toISOString();
    this.conversationHistory.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result
      }],
      timestamp
    });
  }

  /**
   * Ajoute un horodatage au contenu du message pour le contexte LLM
   */
  private addTimestampToContent(content: string | AIContentBlock[], timestamp?: string): string | AIContentBlock[] {
    const ts = timestamp || new Date().toISOString();
    const formatted = `[Timestamp: ${ts}]`;
    
    if (typeof content === 'string') {
      return `${formatted} ${content}`;
    }
    
    // Pour les content blocks (multimodal), ajouter au début
    if (Array.isArray(content) && content.length > 0) {
      return [
        { type: 'text', text: formatted },
        ...content
      ];
    }
    
    return content;
  }

  /**
   * Retourne l'historique nettoyé avec horodatages pour l'API (tool_results compressés, messages vides filtrés)
   */
  getHistoryForAPI(): AIMessage[] {
    const cleaned = cleanOldToolResults(this.conversationHistory as any[]) as AIMessage[];

    // Filtrer les messages avec contenu vide (cause d'erreur API) et ajouter horodatages
    return cleaned.filter(msg => {
      if (typeof msg.content === 'string') {
        return msg.content.trim().length > 0;
      }
      if (Array.isArray(msg.content)) {
        return msg.content.length > 0;
      }
      return true;
    }).map(msg => ({
      ...msg,
      content: this.addTimestampToContent(msg.content, msg.timestamp)
    }));
  }

  /**
   * Retourne l'historique nettoyé (sans horodatages pour usage interne)
   */
  getCleanedHistory(): AIMessage[] {
    const cleaned = cleanOldToolResults(this.conversationHistory as any[]) as AIMessage[];

    // Filtrer les messages avec contenu vide (cause d'erreur API)
    return cleaned.filter(msg => {
      if (typeof msg.content === 'string') {
        return msg.content.trim().length > 0;
      }
      if (Array.isArray(msg.content)) {
        return msg.content.length > 0;
      }
      return true;
    });
  }

  /**
   * Retourne l'historique brut
   */
  getHistory(): AIMessage[] {
    return this.conversationHistory;
  }

  /**
   * Retourne le nombre de messages
   */
  getMessageCount(): number {
    return this.messageCount;
  }

  /**
   * Charge l'historique depuis la base de données
   */
  loadFromDatabase(): void {
    const memory = getMemory();
    const messages = memory.getMessages();

    this.conversationHistory = [];

    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        // Ignorer les messages vides
        if (!msg.content?.trim() && (!msg.images || msg.images.length === 0)) {
          continue;
        }

        let content: string | AIContentBlock[] = msg.content;

        if (msg.role === 'user' && msg.images && msg.images.length > 0) {
          const contentBlocks: AIContentBlock[] = [];
          if (msg.content?.trim()) {
            contentBlocks.push({ type: 'text', text: msg.content });
          }
          for (const img of msg.images) {
            contentBlocks.push({
              type: 'image',
              source: img.source
            } as AIContentBlock);
          }
          content = contentBlocks;
        }

        this.conversationHistory.push({
          role: msg.role,
          content,
          timestamp: msg.timestamp
        });
      }
    }

    console.log(`[HistoryManager] Loaded ${this.conversationHistory.length} messages from database`);
  }

  /**
   * Efface l'historique
   */
  clear(): void {
    this.conversationHistory = [];
    this.messageCount = 0;
  }

  /**
   * Vérifie si c'est une nouvelle session (pas d'historique)
   */
  isNewSession(): boolean {
    return this.conversationHistory.length === 0;
  }
}
