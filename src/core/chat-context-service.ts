/**
 * ChatContextService - Service partagé de gestion du contexte de conversation
 * 
 * Ce service centralise la logique de contexte pour être utilisée par:
 * - Brain (webapp via WebSocket)
 * - MessageProcessor (Telegram)
 * - Toute autre source future
 * 
 * Responsabilités:
 * 1. Charger l'historique depuis la DB avec reconstruction des tool_calls/images
 * 2. Injecter le contexte pertinent (mémoires compressées, connaissances)
 * 3. Construire le system prompt avec les instructions adaptées
 * 4. Nettoyer et formater l'historique pour l'API
 */

import { AIMessage, AIContentBlock, ImageContent } from './brain/types.js';
import { getMemory } from './memory.js';
import { getContextInjector } from './context-injector.js';
import { getCompressor, MemoryCompressor } from './compressor.js';
import { cleanOldToolResults } from './contextCleaner.js';
import { ChatSource } from './chat-adapter.js';
import { PROVIDER, MEMORY } from '../config.js';

export interface LoadedHistory {
  messages: AIMessage[];
  messageCount: number;
}

export interface ContextBuildResult {
  systemPrompt: string;
  messages: any[];  // Format API-ready avec horodatages
  contextInjected: boolean;
}

export class ChatContextService {
  private contextInjector = getContextInjector();
  private compressor: MemoryCompressor | null = getCompressor();

  /**
   * Charge l'historique complet depuis la base de données
   * Reconstruit les tool_calls et images à partir des colonnes JSON
   */
  loadHistoryFromDatabase(sessionId?: string): LoadedHistory {
    const memory = getMemory();
    // Si un sessionId est fourni, l'utiliser explicitement
    // Sinon, utiliser la session courante de la mémoire
    const sid = sessionId || memory.getSessionId();
    
    console.log(`[ChatContextService] Loading history for session: ${sid}`);
    const messages = memory.getMessages(sid, 1000);

    const conversationHistory: AIMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        // Ignorer les messages vides
        if (!msg.content?.trim() && (!msg.images || msg.images.length === 0)) {
          continue;
        }

        let content: string | AIContentBlock[] = msg.content;

        // Reconstruire les tool_results (persistés avec prefix __TOOL_RESULT__)
        if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.startsWith('__TOOL_RESULT__')) {
          const match = msg.content.match(/^__TOOL_RESULT__(.+?)__(.*)$/s);
          if (match) {
            content = [{
              type: 'tool_result',
              tool_use_id: match[1],
              content: match[2]
            }];
            conversationHistory.push({ role: 'user', content, timestamp: msg.timestamp });
            continue;
          }
        }

        // Reconstruire les tool_use blocks depuis tool_calls
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
          const contentBlocks: AIContentBlock[] = [];

          if (msg.content?.trim()) {
            contentBlocks.push({ type: 'text', text: msg.content });
          }

          for (const toolCall of msg.tool_calls) {
            contentBlocks.push({
              type: 'tool_use',
              id: (toolCall as any).id || `tool_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              name: toolCall.name,
              input: toolCall.input
            } as AIContentBlock);
          }

          content = contentBlocks;
        } 
        // Reconstruire les images
        else if (msg.role === 'user' && msg.images && msg.images.length > 0) {
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

        conversationHistory.push({
          role: msg.role,
          content,
          timestamp: msg.timestamp
        });
      }
    }

    // Valider et nettoyer les tool chains incomplètes
    this.validateToolChains(conversationHistory);

    return {
      messages: conversationHistory,
      messageCount: conversationHistory.length
    };
  }

  /**
   * Valide et nettoie les tool chains incomplètes
   * Nécessaire pour l'API Kimi qui exige que chaque tool_use ait un tool_result
   */
  private validateToolChains(history: AIMessage[]): void {
    const toolUseIds = new Set<string>();
    const toolResultIds = new Set<string>();

    for (const msg of history) {
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

    const unresolvedToolUseIds = new Set<string>();
    for (const id of toolUseIds) {
      if (!toolResultIds.has(id)) {
        unresolvedToolUseIds.add(id);
      }
    }

    const orphanedToolResultIds = new Set<string>();
    for (const id of toolResultIds) {
      if (!toolUseIds.has(id)) {
        orphanedToolResultIds.add(id);
      }
    }

    const totalIssues = unresolvedToolUseIds.size + orphanedToolResultIds.size;
    if (totalIssues === 0) return;

    console.warn(`[ChatContextService] Found ${unresolvedToolUseIds.size} unresolved tool_use and ${orphanedToolResultIds.size} orphaned tool_results, cleaning up...`);

    // Filtrer les messages avec tool chains incomplètes
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (!Array.isArray(msg.content)) continue;

      const hasUnresolvedToolUse = msg.content.some(
        block => block.type === 'tool_use' && block.id && unresolvedToolUseIds.has(block.id)
      );

      const hasOrphanedToolResult = msg.content.some(
        block => block.type === 'tool_result' && block.tool_use_id && orphanedToolResultIds.has(block.tool_use_id)
      );

      if (hasUnresolvedToolUse || hasOrphanedToolResult) {
        const hasText = msg.content.some(block => block.type === 'text' && block.text?.trim());
        
        if (!hasText) {
          // Supprimer le message entier
          history.splice(i, 1);
        } else {
          // Garder le texte, supprimer les blocks problématiques
          msg.content = msg.content.filter(block => {
            if (block.type === 'tool_use' && block.id && unresolvedToolUseIds.has(block.id)) {
              return false;
            }
            if (block.type === 'tool_result' && block.tool_use_id && orphanedToolResultIds.has(block.tool_use_id)) {
              return false;
            }
            return true;
          });
        }
      }
    }

    console.log(`[ChatContextService] After cleanup: ${history.length} messages`);
  }

  /**
   * Ajoute un horodatage au contenu pour le contexte LLM
   */
  private addTimestampToContent(content: string | AIContentBlock[], timestamp?: string): string | AIContentBlock[] {
    const ts = timestamp || new Date().toISOString();
    const formatted = `[Timestamp: ${ts}]`;
    
    if (typeof content === 'string') {
      return `${formatted} ${content}`;
    }
    
    if (Array.isArray(content) && content.length > 0) {
      return [{ type: 'text', text: formatted }, ...content];
    }
    
    return content;
  }

  /**
   * Nettoie et formate l'historique pour l'API
   */
  formatHistoryForAPI(history: AIMessage[]): any[] {
    const cleaned = cleanOldToolResults(history as any[]) as AIMessage[];

    return cleaned
      .filter(msg => {
        if (typeof msg.content === 'string') {
          return msg.content.trim().length > 0;
        }
        if (Array.isArray(msg.content)) {
          return msg.content.length > 0;
        }
        return true;
      })
      .map(msg => ({
        role: msg.role,
        content: this.addTimestampToContent(msg.content, msg.timestamp)
      }));
  }

  /**
   * Construit le system prompt avec injection de contexte
   */
  async buildSystemPrompt(userMessage: string, source: ChatSource): Promise<string> {
    // Injecter le contexte pertinent
    const contextBlock = await this.contextInjector.injectContext(userMessage);
    
    let prompt = contextBlock;

    prompt += `\n\n## Source du message\nL'utilisateur écrit depuis: ${source}`;

    if (source === 'telegram') {
      prompt += `\n\n## Instructions Telegram
L'utilisateur écrit depuis un appareil mobile (Telegram). Sauf indication contraire:
- Réponds de manière brève et concise
- Évite les longues listes et explications détaillées
- Va droit au but
- Utilise un formatage simple (pas de tableaux complexes)
- Si une réponse longue est nécessaire, propose de la détailler sur demande`;
    }

    return prompt;
  }

  /**
   * Construit le contexte complet pour une requête
   * Méthode principale utilisée par Brain et MessageProcessor
   */
  async buildContext(
    userMessage: string,
    source: ChatSource,
    sessionId?: string,
    currentImages?: ImageContent[]
  ): Promise<ContextBuildResult> {
    // 1. Charger l'historique depuis la DB
    const loadedHistory = this.loadHistoryFromDatabase(sessionId);
    
    // 2. Construire le system prompt avec injection de contexte
    const systemPrompt = await this.buildSystemPrompt(userMessage, source);
    
    // 3. Formater l'historique pour l'API
    const apiHistory = this.formatHistoryForAPI(loadedHistory.messages);
    
    // 4. Construire le contenu du message user
    let userContent: string | AIContentBlock[] = userMessage;
    
    if (currentImages && currentImages.length > 0) {
      const contentBlocks: AIContentBlock[] = [];
      if (userMessage?.trim()) {
        contentBlocks.push({ type: 'text', text: userMessage });
      }
      for (const img of currentImages) {
        contentBlocks.push({ type: 'image', source: img.source } as AIContentBlock);
      }
      userContent = contentBlocks;
    }
    
    // 5. Assembler les messages complets
    const messages = [
      { role: 'system', content: systemPrompt },
      ...apiHistory,
      { role: 'user', content: userContent }
    ];

    // 6. Déclencher la compression si nécessaire (en arrière-plan)
    this.maybeCompressAsync(loadedHistory.messageCount);

    return {
      systemPrompt,
      messages,
      contextInjected: true
    };
  }

  /**
   * Déclenche la compression en arrière-plan si nécessaire
   */
  private async maybeCompressAsync(messageCount: number): Promise<void> {
    if (!this.compressor) return;
    
    if (messageCount % MEMORY.COMPRESSION_CHECK_INTERVAL === 0) {
      try {
        const compressed = await this.compressor.checkAndCompress();
        if (compressed) {
          console.log('[ChatContextService] Conversation history compressed');
        }
      } catch (err) {
        console.error('[ChatContextService] Compression error:', err);
      }
    }
  }

  /**
   * Sauvegarde un message utilisateur dans la DB
   */
  saveUserMessage(
    content: string,
    images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>,
    source?: ChatSource,
    sessionId?: string
  ): void {
    const memory = getMemory();
    if (sessionId) {
      memory.setSessionId(sessionId);
    }
    memory.addMessage('user', content, undefined, images, source);
  }

  /**
   * Sauvegarde un message assistant dans la DB
   */
  saveAssistantMessage(content: string, source?: ChatSource, sessionId?: string): void {
    const memory = getMemory();
    if (sessionId) {
      memory.setSessionId(sessionId);
    }
    memory.addMessage('assistant', content, undefined, undefined, source);
  }
}

// Singleton
let serviceInstance: ChatContextService | null = null;

export function getChatContextService(): ChatContextService {
  if (!serviceInstance) {
    serviceInstance = new ChatContextService();
  }
  return serviceInstance;
}