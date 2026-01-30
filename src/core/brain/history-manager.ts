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
    if (images && images.length > 0) {
      const contentBlocks: AIContentBlock[] = [{ type: 'text', text: content }];
      for (const img of images) {
        contentBlocks.push({
          type: 'image',
          source: img.source
        } as AIContentBlock);
      }
      this.conversationHistory.push({ role: 'user', content: contentBlocks });
    } else {
      this.conversationHistory.push({ role: 'user', content });
    }
    this.messageCount++;
  }

  /**
   * Ajoute un message assistant à l'historique
   */
  addAssistantMessage(content: AIContentBlock[]): void {
    this.conversationHistory.push({ role: 'assistant', content });
  }

  /**
   * Ajoute un résultat d'outil
   */
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

  /**
   * Retourne l'historique nettoyé (tool_results compressés)
   */
  getCleanedHistory(): AIMessage[] {
    return cleanOldToolResults(this.conversationHistory as any[]) as AIMessage[];
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
        let content: string | AIContentBlock[] = msg.content;

        if (msg.role === 'user' && msg.images && msg.images.length > 0) {
          const contentBlocks: AIContentBlock[] = [{ type: 'text', text: msg.content }];
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
          content
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
