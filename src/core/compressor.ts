/**
 * MemoryCompressor - Compresse l'historique de conversation
 *
 * Stratégie simplifiée:
 * - Appelé manuellement via le tool `compact` ou automatiquement si > 128K tokens
 * - Compresse TOUS les messages de la session en un résumé
 * - Stocke le résumé avec son embedding pour recherche future
 * - Utilise Kimi 2.5 pour la compression (rapide et économique)
 */

import { getMemory, Memory } from './memory';
import { getEmbeddingService, EmbeddingService } from './embedding';
import { Message } from './types';
import { MODELS, TOKENS, MEMORY } from '../config';
import { logger } from './logger';
import { KimiProvider } from './providers/kimi.js';

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
  private kimiProvider: KimiProvider;
  private memory: Memory;
  private embedding: EmbeddingService | null;

  constructor(kimiApiKey: string) {
    this.kimiProvider = new KimiProvider({
      apiKey: kimiApiKey,
      model: MODELS.KIMI_DEFAULT,
      maxTokens: TOKENS.MAX_COMPRESSION_SUMMARY
    });
    this.memory = getMemory();

    try {
      this.embedding = getEmbeddingService();
    } catch (error) {
      logger.warn('Compressor', 'EmbeddingService not available, summaries will not have embeddings');
      this.embedding = null;
    }
  }

  /**
   * Compresse toute la conversation d'une session ou d'un thread
   * @param sessionId - Session à compresser (défaut: session courante)
   * @param threadId - Thread à compresser (prioritaire sur sessionId si spécifié)
   * @returns Le résumé créé ou null si pas de messages
   */
  async compressSession(sessionId?: string, threadId?: string): Promise<CompressedMemory | null> {
    const sid = sessionId || this.memory.getSessionId();

    // Debug: log les paramètres reçus
    logger.debug('Compressor', `compressSession called with sessionId=${sessionId}, threadId=${threadId}`);

    const messages = this.memory.getMessages(sid, 10000, undefined, threadId);

    if (messages.length === 0) {
      logger.info('Compressor', `No messages to compress (threadId=${threadId || 'none'}, sessionId=${sid})`);
      return null;
    }

    const target = threadId ? `thread ${threadId}` : `session ${sid}`;
    logger.info('Compressor', `Compressing ${messages.length} messages from ${target} using Kimi 2.5...`);

    try {
      const compressed = await this.compressMessages(messages, sid, threadId);
      logger.info('Compressor', `Compression complete: ${messages.length} messages -> ${compressed.summary.length} chars`);
      return compressed;
    } catch (error) {
      logger.error('Compressor', `Compression failed: ${(error as Error).stack || String(error)}`);
      throw error;
    }
  }

  /**
   * Compresse un ensemble de messages en résumé via Kimi 2.5
   */
  private async compressMessages(messages: Message[], sessionId: string, threadId?: string): Promise<CompressedMemory> {
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

    const systemPrompt = `Tu es un assistant qui résume des conversations de manière concise mais complète.
Extrais les informations clés:
- Décisions prises
- Informations apprises sur l'utilisateur
- Actions effectuées et leurs résultats
- Contexte important pour la suite
- Erreurs rencontrées et solutions trouvées

Format: Un résumé structuré et factuel, sans fluff. Utilise des bullet points pour la clarté.`;

    // Appel à l'API Kimi via le provider (gère la température correctement)
    const response = await this.kimiProvider.chat(
      [{ role: 'user', content: `Résume cette conversation:\n\n${conversation}` }],
      {
        system: systemPrompt,
        maxTokens: TOKENS.MAX_COMPRESSION_SUMMARY
      }
    );

    // Extraire le texte du résumé
    const textBlock = response.content.find(block => block.type === 'text');
    const summary = textBlock?.type === 'text' ? textBlock.text : '';

    logger.debug('Compressor', `Kimi compression: ${response.usage?.input_tokens ?? 0} in, ${response.usage?.output_tokens ?? 0} out`);

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
      thread_id: threadId || sessionId,
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

    // Créer la table si elle n'existe pas (sans thread_id d'abord pour compatibilité)
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

    // Migration: ajouter thread_id si la colonne n'existe pas
    try {
      // Vérifier si la colonne existe via PRAGMA
      const columns = db.prepare(`PRAGMA table_info(compressed_memories)`).all() as Array<{ name: string }>;
      const hasThreadId = columns.some((col: { name: string }) => col.name === 'thread_id');

      if (!hasThreadId) {
        db.exec(`ALTER TABLE compressed_memories ADD COLUMN thread_id TEXT`);
        logger.info('Compressor', 'Migration: added thread_id column to compressed_memories');
      }
    } catch (migrationError) {
      logger.warn('Compressor', `Migration warning: ${(migrationError as Error).message}`);
    }

    // Créer l'index sur thread_id (après migration)
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_compressed_thread ON compressed_memories(thread_id)`);
    } catch {
      // Index peut déjà exister ou colonne manquante
    }

    const stmt = db.prepare(`
      INSERT INTO compressed_memories (session_id, thread_id, summary, message_ids, start_time, end_time, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      compressed.session_id,
      compressed.thread_id,
      compressed.summary,
      JSON.stringify(compressed.message_ids),
      compressed.start_time,
      compressed.end_time,
      compressed.embedding ? Buffer.from(new Float32Array(compressed.embedding).buffer) : null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Récupère toutes les mémoires compressées pour une session ou un thread
   * @param sessionId Session ID (optionnel)
   * @param threadId Thread ID (prioritaire si spécifié)
   */
  getCompressedMemories(sessionId?: string, threadId?: string): CompressedMemory[] {
    const db = (this.memory as any).db;

    try {
      let query: string;
      let param: string;

      if (threadId) {
        // Filtrer par thread_id
        query = `
          SELECT * FROM compressed_memories
          WHERE thread_id = ?
          ORDER BY created_at ASC
        `;
        param = threadId;
      } else {
        // Filtrer par session_id
        const sid = sessionId || this.memory.getSessionId();
        query = `
          SELECT * FROM compressed_memories
          WHERE session_id = ?
          ORDER BY created_at ASC
        `;
        param = sid;
      }

      const rows = db.prepare(query).all(param) as any[];

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
   * Vérifie si la compression est nécessaire et l'effectue le cas échéant
   * Utile pour la compression automatique basée sur le nombre de messages
   * @returns Le résumé si compression effectuée, null sinon
   */
  async checkAndCompress(): Promise<CompressedMemory | null> {
    const sessionId = this.memory.getSessionId();
    const messages = this.memory.getMessages(sessionId, 10000);

    // Compression automatique si plus de 50 messages
    if (messages.length < 50) {
      return null;
    }

    logger.info('Compressor', `Auto-compression triggered: ${messages.length} messages`);
    return this.compressSession(sessionId);
  }

  /**
   * Vérifie si la compression est nécessaire et l'effectue
   * @param force - Si true, compresse même si le seuil n'est pas atteint
   * @returns true si compression effectuée, false sinon
   */
  async compressIfNeeded(force: boolean = false): Promise<boolean> {
    const sessionId = this.memory.getSessionId();
    const messages = this.memory.getMessages(sessionId, 10000);

    // Ne pas compresser s'il y a trop peu de messages (sauf si forcé)
    if (!force && messages.length < 20) {
      return false;
    }

    // Pas de messages du tout
    if (messages.length === 0) {
      return false;
    }

    try {
      const result = await this.compressSession(sessionId);
      return result !== null;
    } catch (error) {
      logger.error('Compressor', `compressIfNeeded failed: ${error}`);
      return false;
    }
  }

  /**
   * Efface les messages compressés d'une session ou d'un thread
   * (Garde les résumés mais supprime les messages originaux)
   * @param sessionId Session ID (optionnel)
   * @param threadId Thread ID (prioritaire si spécifié)
   */
  clearCompressedMessages(sessionId?: string, threadId?: string): number {
    const memories = this.getCompressedMemories(sessionId, threadId);

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

    const target = threadId ? `thread ${threadId}` : `session ${sessionId || 'current'}`;
    logger.info('Compressor', `Cleared ${allMessageIds.length} compressed messages from ${target}`);
    return allMessageIds.length;
  }
}

// Singleton
let compressorInstance: MemoryCompressor | null = null;

export function getCompressor(): MemoryCompressor | null {
  return compressorInstance;
}

export function initCompressor(kimiApiKey: string): MemoryCompressor {
  compressorInstance = new MemoryCompressor(kimiApiKey);
  logger.info('Compressor', 'Initialized with Kimi 2.5');
  return compressorInstance;
}

export function isCompressorInitialized(): boolean {
  return compressorInstance !== null;
}
