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
   * Estime le nombre de tokens d'un texte (approximation: 4 chars ≈ 1 token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Divise les messages en chunks selon une limite de tokens
   */
  private chunkMessages(messages: Message[], maxTokensPerChunk: number): Message[][] {
    const chunks: Message[][] = [];
    let currentChunk: Message[] = [];
    let currentTokens = 0;

    for (const message of messages) {
      const messageText = this.formatMessageForChunking(message);
      const messageTokens = this.estimateTokens(messageText);

      // Si un seul message dépasse la limite, on le tronque (rare mais possible)
      if (messageTokens > maxTokensPerChunk) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentTokens = 0;
        }
        // On ajoute le message quand même, il sera tronqué lors du formatage
        chunks.push([message]);
        continue;
      }

      // Si ajouter ce message dépasse la limite, on ferme le chunk courant
      if (currentTokens + messageTokens > maxTokensPerChunk && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [message];
        currentTokens = messageTokens;
      } else {
        currentChunk.push(message);
        currentTokens += messageTokens;
      }
    }

    // Ajouter le dernier chunk s'il reste des messages
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Formate un message pour l'estimation de tokens (version légère)
   */
  private formatMessageForChunking(message: Message): string {
    let content = message.content;
    
    // Tronquer les tool_results pour l'estimation
    if (content.startsWith('__TOOL_RESULT__')) {
      const match = content.match(/^__TOOL_RESULT__(.+?)__(.*)$/s);
      if (match) {
        const result = match[2].length > 500 ? match[2].substring(0, 500) + '...[tronqué]' : match[2];
        content = `[Tool Result: ${result}]`;
      }
    }
    
    return `[${message.role.toUpperCase()}]: ${content}`;
  }

  /**
   * Formate un message pour la compression finale
   */
  private formatMessageForCompression(message: Message): string {
    let content = message.content;
    
    // Inclure les tool_calls si présents (message assistant avec appels d'outils)
    if (message.tool_calls) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed: any[] = typeof message.tool_calls === 'string'
          ? JSON.parse(message.tool_calls)
          : message.tool_calls;

        if (Array.isArray(parsed) && parsed.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tools = parsed.map((tc: any) => {
            const name = tc.function?.name || tc.name || 'unknown';
            const argsRaw = tc.function?.arguments || tc.input || {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const args: Record<string, any> = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw;
            return `  - ${name}(${Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})`;
          }).join('\n');
          content = content ? `${content}\n[Tools:\n${tools}]` : `[Tools:\n${tools}]`;
        }
      } catch {
        // Ignorer l'erreur de parsing
      }
    }
    
    // Filtrer les tool_results pour ne garder que l'essentiel
    if (content.startsWith('__TOOL_RESULT__')) {
      const match = content.match(/^__TOOL_RESULT__(.+?)__(.*)$/s);
      if (match) {
        const result = match[2].length > 500 ? match[2].substring(0, 500) + '...[tronqué]' : match[2];
        content = `[Tool Result: ${result}]`;
      }
    }
    
    return `[${message.role.toUpperCase()}]: ${content}`;
  }

  /**
   * Compresse un ensemble de messages en résumé via Kimi 2.5
   * Supporte le chunking automatique si les messages dépassent la limite de tokens
   */
  private async compressMessages(messages: Message[], sessionId: string, threadId?: string): Promise<CompressedMemory> {
    const MAX_TOKENS_PER_CHUNK = 50000; // Limite conservative pour Kimi 2.5 (262k max)
    const totalEstimatedTokens = messages.reduce((sum, m) => sum + this.estimateTokens(this.formatMessageForChunking(m)), 0);

    logger.debug('Compressor', `Total estimated tokens: ${totalEstimatedTokens}, messages: ${messages.length}`);

    // Si la conversation est petite, compression directe
    if (totalEstimatedTokens <= MAX_TOKENS_PER_CHUNK) {
      return this.compressSingleChunk(messages, sessionId, threadId);
    }

    // Sinon, on fait du chunking hiérarchique
    logger.info('Compressor', `Large conversation detected (${totalEstimatedTokens} tokens), using hierarchical chunking...`);
    return this.compressWithChunking(messages, sessionId, threadId, MAX_TOKENS_PER_CHUNK);
  }

  /**
   * Compression d'un seul chunk (conversation courte)
   */
  private async compressSingleChunk(messages: Message[], sessionId: string, threadId?: string): Promise<CompressedMemory> {
    const conversation = messages.map(m => this.formatMessageForCompression(m)).join('\n\n');
    const summary = await this.summarizeText(conversation);
    return this.createAndSaveCompressedMemory(summary, messages, sessionId, threadId);
  }

  /**
   * Compression hiérarchique avec chunking (conversation longue)
   */
  private async compressWithChunking(
    messages: Message[], 
    sessionId: string, 
    threadId: string | undefined, 
    maxTokensPerChunk: number
  ): Promise<CompressedMemory> {
    // Étape 1: Diviser en chunks
    const chunks = this.chunkMessages(messages, maxTokensPerChunk);
    logger.info('Compressor', `Split into ${chunks.length} chunks`);

    // Étape 2: Résumer chaque chunk EN PARALLÈLE pour accélérer
    logger.info('Compressor', `Summarizing ${chunks.length} chunks in parallel...`);
    const chunkPromises = chunks.map(async (chunk, i) => {
      logger.debug('Compressor', `Starting chunk ${i + 1}/${chunks.length} (${chunk.length} messages)`);
      const conversation = chunk.map(m => this.formatMessageForCompression(m)).join('\n\n');
      const chunkSummary = await this.summarizeText(
        conversation,
        `Résume cette partie ${i + 1}/${chunks.length} de la conversation. Sois concis mais conserve les informations clés.`
      );
      logger.debug('Compressor', `Finished chunk ${i + 1}/${chunks.length}`);
      return `--- Partie ${i + 1}/${chunks.length} ---\n${chunkSummary}`;
    });

    const chunkSummaries = await Promise.all(chunkPromises);
    logger.info('Compressor', `All ${chunks.length} chunks summarized`);

    // Étape 3: Fusionner les résumés en un résumé final
    const mergedSummaries = chunkSummaries.join('\n\n');
    const finalSummary = await this.summarizeText(
      mergedSummaries,
      `Tu as reçu plusieurs résumés de parties d'une conversation. Crée un résumé final cohérent qui:\n` +
      `- Relie les parties entre elles\n` +
      `- Élimine les redondances\n` +
      `- Conserve l'essentiel: décisions, infos sur l'utilisateur, actions, contexte`
    );

    return this.createAndSaveCompressedMemory(finalSummary, messages, sessionId, threadId);
  }

  /**
   * Résume un texte via Kimi 2.5
   */
  private async summarizeText(text: string, customPrompt?: string): Promise<string> {
    const systemPrompt = customPrompt || `Tu es un assistant qui résume des conversations de manière concise mais complète.
Extrais les informations clés:
- Décisions prises
- Informations apprises sur l'utilisateur
- Actions effectuées et leurs résultats
- Contexte important pour la suite
- Erreurs rencontrées et solutions trouvées

Format: Un résumé structuré et factuel, sans fluff. Utilise des bullet points pour la clarté.`;

    const response = await this.kimiProvider.chat(
      [{ role: 'user', content: `Résume ceci:\n\n${text}` }],
      {
        system: systemPrompt,
        maxTokens: TOKENS.MAX_COMPRESSION_SUMMARY
      }
    );

    const textBlock = response.content.find(block => block.type === 'text');
    const summary = textBlock?.type === 'text' ? textBlock.text : '';

    logger.debug('Compressor', `Kimi compression: ${response.usage?.input_tokens ?? 0} in, ${response.usage?.output_tokens ?? 0} out`);

    return summary;
  }

  /**
   * Crée et sauvegarde une mémoire compressée
   */
  private async createAndSaveCompressedMemory(
    summary: string,
    messages: Message[],
    sessionId: string,
    threadId?: string
  ): Promise<CompressedMemory> {
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
   * Marque les messages compressés comme cachés du contexte LLM
   * (Garde les résumés ET les messages originaux pour l'affichage UI)
   * Les messages restent en base mais ne sont pas envoyés au LLM
   * @param sessionId Session ID (optionnel)
   * @param threadId Thread ID (prioritaire si spécifié)
   */
  markMessagesAsCompressed(sessionId?: string, threadId?: string): number {
    const memories = this.getCompressedMemories(sessionId, threadId);

    if (memories.length === 0) {
      return 0;
    }

    // Collecter tous les IDs de messages compressés
    const allMessageIds = memories.flatMap(m => m.message_ids);

    if (allMessageIds.length === 0) {
      return 0;
    }

    // Marquer les messages comme compressés (cachés du contexte LLM, mais gardés pour UI)
    const db = (this.memory as any).db;
    const placeholders = allMessageIds.map(() => '?').join(',');
    db.prepare(`UPDATE conversations SET compressed = 1 WHERE id IN (${placeholders})`).run(...allMessageIds);

    const target = threadId ? `thread ${threadId}` : `session ${sessionId || 'current'}`;
    logger.info('Compressor', `Marked ${allMessageIds.length} messages as compressed (hidden from LLM context) in ${target}`);
    return allMessageIds.length;
  }

  /**
   * @deprecated Utilisez markMessagesAsCompressed() à la place
   * Cette méthode est conservée pour compatibilité mais ne supprime plus les messages
   */
  clearCompressedMessages(sessionId?: string, threadId?: string): number {
    logger.warn('Compressor', 'clearCompressedMessages() is deprecated, using markMessagesAsCompressed() instead');
    return this.markMessagesAsCompressed(sessionId, threadId);
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
