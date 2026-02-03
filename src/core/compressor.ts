/**
 * MemoryCompressor - Compresse l'historique de conversation
 *
 * Stratégie simplifiée:
 * - Appelé manuellement via le tool `compact` ou automatiquement si > 128K tokens
 * - Compresse TOUS les messages de la session en un résumé
 * - Stocke le résumé avec son embedding pour recherche future
 */

import Anthropic from '@anthropic-ai/sdk';
import { getMemory, Memory } from './memory';
import { getEmbeddingService, EmbeddingService } from './embedding';
import { Message } from './types';
import { MODELS, TOKENS, MEMORY } from '../config';
import { logger } from './logger';

export interface CompressedMemory {
  id?: number;
  session_id: string;
  thread_id: string;
  summary: string;
  message_ids: number[];
  start_time: string;
  end_time: string;
  embedding?: number[];
  created_at?: string;
}

export class MemoryCompressor {
  private anthropic: Anthropic;
  private memory: Memory;
  private embedding: EmbeddingService | null;

  constructor(anthropicApiKey: string) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.memory = getMemory();

    try {
      this.embedding = getEmbeddingService();
    } catch (error) {
      logger.warn('Compressor', 'EmbeddingService not available, summaries will not have embeddings');
      this.embedding = null;
    }
  }

  /**
   * Compresse toute la conversation d'une session
   * @param sessionId - Session à compresser (défaut: session courante)
   * @returns Le résumé créé ou null si pas de messages
   */
  async compressSession(sessionId?: string): Promise<CompressedMemory | null> {
    const sid = sessionId || this.memory.getSessionId();
    const messages = this.memory.getMessages(sid, 10000);

    if (messages.length === 0) {
      logger.info('Compressor', 'No messages to compress');
      return null;
    }

    logger.info('Compressor', `Compressing ${messages.length} messages from session ${sid}...`);

    try {
      const compressed = await this.compressMessages(messages, sid);
      logger.info('Compressor', `Compression complete: ${messages.length} messages -> ${compressed.summary.length} chars`);
      return compressed;
    } catch (error) {
      logger.error('Compressor', `Compression failed: ${(error as Error).stack || String(error)}`);
      throw error;
    }
  }

  /**
   * Compresse un ensemble de messages en résumé
   */
  private async compressMessages(messages: Message[], sessionId: string): Promise<CompressedMemory> {
    // Formater les messages pour le résumé
    const conversation = messages.map(m => {
      // Filtrer les tool_results pour ne garder que l'essentiel
      let content = m.content;
      if (content.startsWith('__TOOL_RESULT__')) {
        const match = content.match(/^__TOOL_RESULT__(.+?)__(.*)$/s);
        if (match) {
          // Tronquer les résultats longs
          const result = match[2].length > 500 ? match[2].substring(0, 500) + '...[tronqué]' : match[2];
          content = `[Tool Result: ${result}]`;
        }
      }
      return `[${m.role.toUpperCase()}]: ${content}`;
    }).join('\n\n');

    // Générer le résumé via Claude
    const response = await this.anthropic.messages.create({
      model: MODELS.COMPRESSOR,
      max_tokens: TOKENS.MAX_COMPRESSION_SUMMARY,
      system: `Tu es un assistant qui résume des conversations de manière concise mais complète.
Extrais les informations clés:
- Décisions prises
- Informations apprises sur l'utilisateur
- Actions effectuées et leurs résultats
- Contexte important pour la suite
- Erreurs rencontrées et solutions trouvées

Format: Un résumé structuré et factuel, sans fluff. Utilise des bullet points pour la clarté.`,
      messages: [{
        role: 'user',
        content: `Résume cette conversation:\n\n${conversation}`
      }]
    });

    const summary = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Générer l'embedding du résumé (si disponible)
    let embeddingVector: number[] | undefined;
    if (this.embedding) {
      try {
        const embeddingResult = await this.embedding.embed(summary);
        embeddingVector = embeddingResult.vector;
      } catch (error) {
        logger.warn('Compressor', 'Failed to generate embedding for summary:', error);
      }
    }

    // Créer l'objet mémoire compressée
    const compressed: CompressedMemory = {
      session_id: sessionId,
      thread_id: sessionId,
      summary,
      message_ids: messages.map(m => m.id!).filter(Boolean),
      start_time: messages[0].timestamp,
      end_time: messages[messages.length - 1].timestamp,
      embedding: embeddingVector
    };

    // Sauvegarder dans la DB
    this.saveCompressedMemory(compressed);

    return compressed;
  }

  /**
   * Sauvegarde une mémoire compressée dans la DB
   */
  private saveCompressedMemory(compressed: CompressedMemory): number {
    const db = (this.memory as any).db;

    // Créer la table si elle n'existe pas
    db.exec(`
      CREATE TABLE IF NOT EXISTS compressed_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        message_ids TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        embedding BLOB,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_compressed_session ON compressed_memories(session_id);
    `);

    const stmt = db.prepare(`
      INSERT INTO compressed_memories (session_id, summary, message_ids, start_time, end_time, embedding)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      compressed.session_id,
      compressed.summary,
      JSON.stringify(compressed.message_ids),
      compressed.start_time,
      compressed.end_time,
      compressed.embedding ? Buffer.from(new Float32Array(compressed.embedding).buffer) : null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Récupère toutes les mémoires compressées pour une session
   */
  getCompressedMemories(sessionId?: string): CompressedMemory[] {
    const db = (this.memory as any).db;
    const sid = sessionId || this.memory.getSessionId();

    try {
      const rows = db.prepare(`
        SELECT * FROM compressed_memories
        WHERE session_id = ?
        ORDER BY created_at ASC
      `).all(sid) as any[];

      return rows.map(row => ({
        id: row.id,
        session_id: row.session_id,
        thread_id: row.thread_id || row.session_id,
        summary: row.summary,
        message_ids: JSON.parse(row.message_ids),
        start_time: row.start_time,
        end_time: row.end_time,
        embedding: row.embedding ? Array.from(new Float32Array(row.embedding.buffer)) : undefined,
        created_at: row.created_at
      }));
    } catch {
      return [];
    }
  }

  /**
   * Recherche les mémoires pertinentes par similarité sémantique
   */
  async searchRelevantMemories(query: string, topK: number = MEMORY.RELEVANT_MEMORIES_TOP_K): Promise<CompressedMemory[]> {
    const allMemories = this.getCompressedMemories();

    if (allMemories.length === 0) {
      return [];
    }

    if (!this.embedding) {
      return allMemories.slice(0, topK);
    }

    let queryEmbedding;
    try {
      queryEmbedding = await this.embedding.embed(query);
    } catch (error) {
      logger.warn('Compressor', 'Failed to generate query embedding, returning recent memories:', error);
      return allMemories.slice(0, topK);
    }

    const withEmbeddings = allMemories.filter(m => m.embedding && m.embedding.length > 0);

    if (withEmbeddings.length === 0) {
      return allMemories.slice(0, topK);
    }

    const candidates = withEmbeddings.map(m => ({
      id: m.id!,
      vector: m.embedding!
    }));

    const topResults = EmbeddingService.findTopK(queryEmbedding.vector, candidates, topK);

    return topResults.map(result =>
      withEmbeddings.find(m => m.id === result.id)!
    );
  }

  /**
   * Efface les messages compressés de la session courante
   * (Garde les résumés mais supprime les messages originaux)
   */
  clearCompressedMessages(sessionId?: string): number {
    const sid = sessionId || this.memory.getSessionId();
    const memories = this.getCompressedMemories(sid);

    if (memories.length === 0) {
      return 0;
    }

    // Collecter tous les IDs de messages compressés
    const allMessageIds = memories.flatMap(m => m.message_ids);

    if (allMessageIds.length === 0) {
      return 0;
    }

    // Supprimer les messages de la DB
    const db = (this.memory as any).db;
    const placeholders = allMessageIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`).run(...allMessageIds);

    logger.info('Compressor', `Cleared ${allMessageIds.length} compressed messages`);
    return allMessageIds.length;
  }
}

// Singleton
let compressorInstance: MemoryCompressor | null = null;

export function getCompressor(): MemoryCompressor | null {
  return compressorInstance;
}

export function initCompressor(anthropicApiKey: string): MemoryCompressor {
  compressorInstance = new MemoryCompressor(anthropicApiKey);
  logger.info('Compressor', 'Initialized');
  return compressorInstance;
}

export function isCompressorInitialized(): boolean {
  return compressorInstance !== null;
}
