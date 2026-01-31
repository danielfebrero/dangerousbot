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

        // Check if this is a tool result message (persisted with __TOOL_RESULT__ prefix)
        if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.startsWith('__TOOL_RESULT__')) {
          const match = msg.content.match(/^__TOOL_RESULT__(.+?)__(.*)$/s);
          if (match) {
            const toolUseId = match[1];
            const resultContent = match[2];
            content = [{
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: resultContent
            }];
            this.conversationHistory.push({
              role: 'user',
              content,
              timestamp: msg.timestamp
            });
            continue;
          }
        }

        // Reconstruct assistant messages with tool_use blocks from tool_calls column
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
          const contentBlocks: AIContentBlock[] = [];

          // Add text content if present
          if (msg.content?.trim()) {
            contentBlocks.push({ type: 'text', text: msg.content });
          }

          // Add tool_use blocks from tool_calls
          for (const toolCall of msg.tool_calls) {
            contentBlocks.push({
              type: 'tool_use',
              id: (toolCall as any).id || `tool_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              name: toolCall.name,
              input: toolCall.input
            } as AIContentBlock);
          }

          content = contentBlocks;
        } else if (msg.role === 'user' && msg.images && msg.images.length > 0) {
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

    // Validate and fix incomplete tool chains (critical for Kimi API)
    this.validateToolChains();
  }

  /**
   * Validates tool chains and removes incomplete ones.
   * Kimi API requires that every tool_use has a corresponding tool_result.
   */
  private validateToolChains(): void {
    // Collect all tool_use IDs and tool_result IDs
    const toolUseIds = new Set<string>();
    const toolResultIds = new Set<string>();

    for (const msg of this.conversationHistory) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use' && block.id) {
            toolUseIds.add(block.id);
          } else if (block.type === 'tool_result' && block.tool_use_id) {
            toolResultIds.add(block.tool_use_id);
          }
        }
      }
    }

    // Find unresolved tool_use IDs (tool calls without results)
    const unresolvedIds = new Set<string>();
    for (const id of toolUseIds) {
      if (!toolResultIds.has(id)) {
        unresolvedIds.add(id);
      }
    }

    if (unresolvedIds.size === 0) {
      return; // All tool chains are complete
    }

    console.warn(`[HistoryManager] Found ${unresolvedIds.size} incomplete tool chains, removing them...`);

    // Remove messages with incomplete tool chains
    // Strategy: Remove assistant messages that have unresolved tool_use blocks
    // and any orphaned tool_result messages
    this.conversationHistory = this.conversationHistory.filter(msg => {
      if (!Array.isArray(msg.content)) {
        return true; // Keep simple string messages
      }

      // Check if this message has any unresolved tool_use
      const hasUnresolvedToolUse = msg.content.some(
        block => block.type === 'tool_use' && block.id && unresolvedIds.has(block.id)
      );

      if (hasUnresolvedToolUse) {
        // If the message has ONLY tool_use blocks (no text), remove it entirely
        const hasText = msg.content.some(block => block.type === 'text' && block.text?.trim());
        if (!hasText) {
          return false; // Remove message entirely
        }
        // Otherwise, strip the tool_use blocks but keep text
        msg.content = msg.content.filter(block => block.type !== 'tool_use');
      }

      return true;
    });

    console.log(`[HistoryManager] After cleanup: ${this.conversationHistory.length} messages`);
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
