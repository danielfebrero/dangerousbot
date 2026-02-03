/**
 * MessageEmbedder - Génère des embeddings pour les messages en temps réel (background)
 *
 * Appelé après chaque message user/assistant pour créer un embedding
 * permettant la recherche sémantique dans l'historique.
 */

import { getMemory, Memory } from './memory';
import { getEmbeddingService, EmbeddingService } from './embedding';
import { logger } from './logger';

export class MessageEmbedder {
  private memory: Memory;
  private embedding: EmbeddingService | null = null;
  private pendingEmbeddings: Map<number, Promise<void>> = new Map();

  constructor() {
    this.memory = getMemory();

    try {
      this.embedding = getEmbeddingService();
    } catch (error) {
      logger.warn('MessageEmbedder', 'EmbeddingService not available - message embeddings disabled');
    }
  }

  /**
   * Embed un message de manière asynchrone (non-bloquant)
   * Appelé juste après l'ajout d'un message en DB
   */
  embedMessageAsync(messageId: number, content: string): void {
    if (!this.embedding) return;
    if (!content?.trim()) return;

    // Ne pas ré-embedder un message déjà en cours
    if (this.pendingEmbeddings.has(messageId)) return;

    const promise = this.embedMessage(messageId, content);
    this.pendingEmbeddings.set(messageId, promise);

    promise.finally(() => {
      this.pendingEmbeddings.delete(messageId);
    });
  }

  /**
   * Embed un message (interne)
   */
  private async embedMessage(messageId: number, content: string): Promise<void> {
    if (!this.embedding) return;

    try {
      const result = await this.embedding.embed(content);
      this.memory.updateMessageEmbedding(messageId, result.vector);
      logger.debug('MessageEmbedder', `Embedded message ${messageId} (${result.tokenCount} tokens)`);
    } catch (error) {
      logger.error('MessageEmbedder', `Failed to embed message ${messageId}:`, error);
    }
  }

  /**
   * Répare les messages sans embedding (appelé au démarrage)
   */
  async repairMissingEmbeddings(batchSize: number = 50): Promise<{ repaired: number; failed: number }> {
    if (!this.embedding) {
      logger.warn('MessageEmbedder', 'Cannot repair: EmbeddingService not available');
      return { repaired: 0, failed: 0 };
    }

    let repaired = 0;
    let failed = 0;
    let hasMore = true;

    while (hasMore) {
      const messages = this.memory.getMessagesWithoutEmbedding(batchSize);

      if (messages.length === 0) {
        hasMore = false;
        break;
      }

      logger.info('MessageEmbedder', `Repairing ${messages.length} messages without embeddings...`);

      for (const msg of messages) {
        if (!msg.content?.trim()) {
          failed++;
          continue;
        }

        try {
          const result = await this.embedding.embed(msg.content);
          this.memory.updateMessageEmbedding(msg.id, result.vector);
          repaired++;
        } catch (error) {
          failed++;
          logger.error('MessageEmbedder', `Failed to repair embedding for message ${msg.id}:`, error);
        }
      }

      // Si on a traité moins que le batch, c'est qu'on a fini
      if (messages.length < batchSize) {
        hasMore = false;
      }
    }

    if (repaired > 0 || failed > 0) {
      logger.info('MessageEmbedder', `Repair complete: ${repaired} repaired, ${failed} failed`);
    }

    return { repaired, failed };
  }

  /**
   * Recherche sémantique dans les messages
   */
  async searchMessages(
    query: string,
    topK: number = 5,
    sessionId?: string
  ): Promise<Array<{ id: number; content: string; role: string; similarity: number; timestamp: string }>> {
    if (!this.embedding) {
      logger.warn('MessageEmbedder', 'Search unavailable: EmbeddingService not initialized');
      return [];
    }

    // Générer l'embedding de la query
    let queryEmbedding: number[];
    try {
      const result = await this.embedding.embed(query);
      queryEmbedding = result.vector;
    } catch (error) {
      logger.error('MessageEmbedder', 'Failed to embed query:', error);
      return [];
    }

    // Récupérer tous les messages avec embeddings
    const messages = this.memory.getMessagesWithEmbeddings(sessionId);

    if (messages.length === 0) {
      return [];
    }

    // Calculer les similarités
    const scored = messages.map(msg => ({
      ...msg,
      similarity: EmbeddingService.cosineSimilarity(queryEmbedding, msg.embedding)
    }));

    // Trier par similarité et retourner les top K
    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map(({ embedding, ...rest }) => rest);
  }
}

// Singleton
let embedderInstance: MessageEmbedder | null = null;

export function getMessageEmbedder(): MessageEmbedder {
  if (!embedderInstance) {
    embedderInstance = new MessageEmbedder();
  }
  return embedderInstance;
}

export function initMessageEmbedder(): MessageEmbedder {
  embedderInstance = new MessageEmbedder();
  return embedderInstance;
}
