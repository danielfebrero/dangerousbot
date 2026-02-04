/**
 * Memory - SQLite Vector Database pour DangerousBot
 * Gère la persistance des conversations et prépare pour les embeddings
 */

import Database from 'better-sqlite3';
import { Message, Knowledge, Stats } from './types';
import { logger } from './logger';
import { getDatabase } from '../database/index.js';

export class Memory {
  private db: Database.Database;
  private currentSessionId: string;

  constructor() {
    this.db = getDatabase();
    // Reprendre la dernière session si elle existe, sinon en créer une nouvelle
    const lastSession = this.getLastSessionIdInternal();
    this.currentSessionId = lastSession || this.generateSessionId();
    logger.info('Memory', `Session: ${this.currentSessionId} (${lastSession ? 'reprise' : 'nouvelle'})`);
  }

  private getLastSessionIdInternal(): string | null {
    const row = this.db.prepare(`
      SELECT session_id FROM conversations
      ORDER BY created_at DESC LIMIT 1
    `).get() as { session_id: string } | undefined;
    return row?.session_id || null;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============ Session Management ============

  getSessionId(): string {
    return this.currentSessionId;
  }

  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  getLastSessionId(): string | null {
    const row = this.db.prepare(`
      SELECT session_id FROM conversations
      ORDER BY created_at DESC LIMIT 1
    `).get() as { session_id: string } | undefined;
    return row?.session_id || null;
  }

  resumeLastSession(): boolean {
    const lastSession = this.getLastSessionId();
    if (lastSession) {
      this.currentSessionId = lastSession;
      return true;
    }
    return false;
  }

  // ============ Messages ============

  addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    toolCalls?: Array<{ id?: string; name: string; input: unknown }>,
    images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>,
    source?: 'webapp' | 'telegram',
    specifiedThreadId?: string
  ): number {
    // Vérifier si un message identique existe déjà dans les 5 dernières secondes (anti-doublon)
    const recentDuplicate = this.db.prepare(`
      SELECT id FROM conversations
      WHERE session_id = ? AND role = ? AND content = ?
      AND datetime(timestamp) > datetime('now', '-5 seconds')
      LIMIT 1
    `).get(this.currentSessionId, role, content) as { id: number } | undefined;

    if (recentDuplicate) {
      logger.debug('Memory', `Doublon détecté et ignoré: ${role}`, { content: content.substring(0, 50) });
      return recentDuplicate.id;
    }

    // Utiliser le threadId spécifié ou récupérer/créer le main thread
    let threadId: string;
    if (specifiedThreadId) {
      // Vérifier que le thread existe
      const existingThread = this.db.prepare(`SELECT id FROM threads WHERE id = ?`).get(specifiedThreadId) as { id: string } | undefined;
      if (existingThread) {
        threadId = specifiedThreadId;
      } else {
        // Créer le thread s'il n'existe pas
        this.db.prepare(`INSERT INTO threads (id, title, is_main, source) VALUES (?, ?, ?, ?)`).run(
          specifiedThreadId,
          source === 'telegram' ? 'Telegram Main' : 'Main Thread',
          1,
          source || null
        );
        threadId = specifiedThreadId;
      }
    } else {
      // Rétrocompatibilité: récupérer ou créer le main thread
      let mainThread = this.db.prepare(`SELECT id FROM threads WHERE is_main = 1 ORDER BY created_at DESC LIMIT 1`).get() as { id: string } | undefined;
      if (!mainThread) {
        // Créer le main thread s'il n'existe pas
        const mainThreadId = `thread_main_${Date.now()}`;
        this.db.prepare(`INSERT INTO threads (id, title, is_main) VALUES (?, ?, ?)`).run(mainThreadId, 'Main Thread', 1);
        mainThread = { id: mainThreadId };
      }
      threadId = mainThread.id;
    }
    
    const stmt = this.db.prepare(`
      INSERT INTO conversations (thread_id, session_id, role, content, tool_calls, images, source, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      threadId,
      this.currentSessionId,
      role,
      content,
      toolCalls ? JSON.stringify(toolCalls) : null,
      images ? JSON.stringify(images) : null,
      source || null,
      new Date().toISOString()
    );
    return result.lastInsertRowid as number;
  }

  getMessages(
    sessionId?: string,
    limit: number = 100,
    sourceFilter?: 'webapp' | 'telegram' | null,
    threadId?: string
  ): (Message & { images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>; source?: 'webapp' | 'telegram' })[] {
    const sid = sessionId || this.currentSessionId;

    // Construire la requête avec filtre optionnel
    // IMPORTANT: Ne récupérer que les messages NON compressés (compressed = 0 ou NULL)
    // pour le contexte LLM. Les messages compressés restent visibles dans l'UI mais
    // ne sont pas envoyés au modèle (remplacés par leur résumé).
    let query = `
      SELECT c.id, c.session_id, c.role, c.content, c.tool_calls, c.images, c.source, c.timestamp
      FROM conversations c
      WHERE c.session_id = ? AND (c.compressed = 0 OR c.compressed IS NULL)
    `;
    const params: (string | number)[] = [sid];

    // Si threadId est spécifié, filtrer par thread_id directement dans conversations
    if (threadId) {
      query = `
        SELECT c.id, c.session_id, c.role, c.content, c.tool_calls, c.images, c.source, c.timestamp
        FROM conversations c
        WHERE c.thread_id = ? AND (c.compressed = 0 OR c.compressed IS NULL)
      `;
      params[0] = threadId;
      console.log(`[Memory.getMessages] Filtering by thread_id=${threadId} (non-compressed only)`);
    } else {
      console.log(`[Memory.getMessages] Filtering by session_id=${sid} (non-compressed only)`);
    }

    if (sourceFilter) {
      query += ` AND (c.source = ? OR c.source IS NULL)`;
      params.push(sourceFilter);
    }

    query += ` ORDER BY c.id DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as Array<Message & { tool_calls?: string; images?: string; source?: 'webapp' | 'telegram' }>;

    console.log(`[Memory.getMessages] Found ${rows.length} non-compressed messages for LLM context`);

    // Inverser pour ordre chronologique + parser les JSON
    return rows.reverse().map(row => ({
      ...row,
      tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      images: row.images ? JSON.parse(row.images) : undefined
    }));
  }

  getRecentMessages(count: number = 20, sourceFilter?: 'webapp' | 'telegram' | null): Message[] {
    // IMPORTANT: Cette méthode récupère TOUS les messages (compressés et non-compressés)
    // pour l'affichage UI. Les messages compressés sont marqués avec compressed=1.
    // Le contexte LLM utilise getMessagesForThread() qui filtre les compressés.
    let query = `
      SELECT id, session_id, role, content, tool_calls, source, timestamp, compressed
      FROM conversations
      WHERE session_id = ?
    `;
    const params: (string | number)[] = [this.currentSessionId];

    if (sourceFilter) {
      query += ` AND (source = ? OR source IS NULL)`;
      params.push(sourceFilter);
    }

    query += ` ORDER BY id DESC LIMIT ?`;
    params.push(count);

    const rows = this.db.prepare(query).all(...params) as Array<Message & { tool_calls?: string; source?: 'webapp' | 'telegram'; compressed?: number }>;

    return rows.reverse().map(row => ({
      ...row,
      tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      compressed: row.compressed === 1
    }));
  }

  // ============ Knowledge ============

  addKnowledge(type: Knowledge['type'], content: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO knowledge (type, content, created_at)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(type, content, new Date().toISOString());
    return result.lastInsertRowid as number;
  }

  getKnowledge(type?: Knowledge['type']): Knowledge[] {
    if (type) {
      return this.db.prepare(`
        SELECT * FROM knowledge WHERE type = ? ORDER BY created_at DESC
      `).all(type) as Knowledge[];
    }
    return this.db.prepare(`
      SELECT * FROM knowledge ORDER BY created_at DESC
    `).all() as Knowledge[];
  }

  // ============ Config ============

  setConfig(key: string, value: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO config (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `).run(key, value);
  }

  getConfig(key: string): string | null {
    const row = this.db.prepare(`
      SELECT value FROM config WHERE key = ?
    `).get(key) as { value: string } | undefined;
    return row?.value || null;
  }

  // ============ Telegram Thread Persistence ============

  /**
   * Sauvegarde le thread actif pour un utilisateur Telegram
   * Persiste entre les redémarrages du serveur
   */
  setTelegramActiveThread(userId: number, threadId: string): void {
    this.setConfig(`telegram.activeThread.${userId}`, threadId);
  }

  /**
   * Récupère le thread actif sauvegardé pour un utilisateur Telegram
   * Retourne null si aucun thread n'est sauvegardé
   */
  getTelegramActiveThread(userId: number): string | null {
    return this.getConfig(`telegram.activeThread.${userId}`);
  }

  // ============ Embeddings ============

  addEmbedding(conversationId: number, vector: Buffer, metadata: Record<string, unknown>): number {
    const stmt = this.db.prepare(`
      INSERT INTO embeddings (conversation_id, vector, metadata)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(conversationId, vector, JSON.stringify(metadata));
    return result.lastInsertRowid as number;
  }

  /**
   * Met à jour l'embedding d'un message de conversation
   */
  updateMessageEmbedding(messageId: number, embedding: number[]): void {
    const buffer = Buffer.from(new Float32Array(embedding).buffer);
    this.db.prepare(`UPDATE conversations SET embedding = ? WHERE id = ?`).run(buffer, messageId);
  }

  /**
   * Récupère les messages sans embedding (pour repair au démarrage)
   */
  getMessagesWithoutEmbedding(limit: number = 100): Array<{ id: number; content: string; role: string }> {
    return this.db.prepare(`
      SELECT id, content, role FROM conversations
      WHERE embedding IS NULL AND content IS NOT NULL AND content != ''
      ORDER BY id ASC
      LIMIT ?
    `).all(limit) as Array<{ id: number; content: string; role: string }>;
  }

  /**
   * Récupère tous les messages avec leurs embeddings pour la recherche sémantique
   */
  getMessagesWithEmbeddings(sessionId?: string): Array<{ id: number; content: string; role: string; embedding: number[]; timestamp: string }> {
    const sid = sessionId || this.currentSessionId;
    const rows = this.db.prepare(`
      SELECT id, content, role, embedding, timestamp FROM conversations
      WHERE session_id = ? AND embedding IS NOT NULL
      ORDER BY id ASC
    `).all(sid) as Array<{ id: number; content: string; role: string; embedding: Buffer; timestamp: string }>;

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      role: row.role,
      timestamp: row.timestamp,
      embedding: Array.from(new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4))
    }));
  }

  // ============ Stats ============

  getStats(): Stats {
    const sessions = this.db.prepare(`
      SELECT COUNT(DISTINCT session_id) as count FROM conversations
    `).get() as { count: number };

    const messages = this.db.prepare(`
      SELECT COUNT(*) as count FROM conversations
    `).get() as { count: number };

    const knowledge = this.db.prepare(`
      SELECT COUNT(*) as count FROM knowledge
    `).get() as { count: number };

    return {
      sessions: sessions.count,
      messages: messages.count,
      knowledge: knowledge.count
    };
  }

  // ============ Export / Import ============

  exportSession(sessionId?: string): Message[] {
    return this.getMessages(sessionId || this.currentSessionId, 10000);
  }

  // ============ Code Embeddings ============

  addCodeEmbedding(
    filePath: string,
    content: string,
    contentHash: string,
    embedding: number[],
    tokenCount?: number,
    fileSize?: number,
    lastModified?: string,
    projectName: string = 'dangerousbot'
  ): number {
    const buffer = Buffer.from(new Float64Array(embedding).buffer);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO code_embeddings 
      (file_path, content, content_hash, embedding, token_count, file_size, last_modified, indexed_at, project_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);
    const result = stmt.run(
      filePath,
      content,
      contentHash,
      buffer,
      tokenCount || 0,
      fileSize || 0,
      lastModified || new Date().toISOString(),
      projectName
    );
    return result.lastInsertRowid as number;
  }

  getCodeEmbedding(filePath: string, projectName: string = 'dangerousbot'): { id: number; file_path: string; content: string; content_hash: string; embedding: number[]; token_count: number; indexed_at: string } | null {
    const row = this.db.prepare(`
      SELECT id, file_path, content, content_hash, embedding, token_count, indexed_at
      FROM code_embeddings WHERE file_path = ? AND project_name = ?
    `).get(filePath, projectName) as { id: number; file_path: string; content: string; content_hash: string; embedding: Buffer; token_count: number; indexed_at: string } | undefined;
    
    if (!row) return null;
    
    // Convertir le buffer en array de nombres
    const floatArray = new Float64Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 8);
    
    return {
      ...row,
      embedding: Array.from(floatArray)
    };
  }

  getAllCodeEmbeddings(projectName?: string): Array<{ id: number; file_path: string; content: string; embedding: number[] }> {
    const sql = projectName 
      ? `SELECT id, file_path, content, embedding FROM code_embeddings WHERE project_name = ?`
      : `SELECT id, file_path, content, embedding FROM code_embeddings`;
    
    const rows = projectName
      ? this.db.prepare(sql).all(projectName) as Array<{ id: number; file_path: string; content: string; embedding: Buffer }>
      : this.db.prepare(sql).all() as Array<{ id: number; file_path: string; content: string; embedding: Buffer }>;
    
    return rows.map(row => {
      const floatArray = new Float64Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 8);
      return {
        ...row,
        embedding: Array.from(floatArray)
      };
    });
  }

  deleteCodeEmbedding(filePath: string, projectName?: string): void {
    if (projectName) {
      this.db.prepare(`DELETE FROM code_embeddings WHERE file_path = ? AND project_name = ?`).run(filePath, projectName);
    } else {
      this.db.prepare(`DELETE FROM code_embeddings WHERE file_path = ?`).run(filePath);
    }
  }

  deleteProjectEmbeddings(projectName: string): void {
    this.db.prepare(`DELETE FROM code_embeddings WHERE project_name = ?`).run(projectName);
  }

  getCodeEmbeddingStats(projectName?: string): { total_files: number; total_tokens: number; last_indexed: string | null } {
    const sql = projectName
      ? `SELECT COUNT(*) as total_files, SUM(token_count) as total_tokens, MAX(indexed_at) as last_indexed FROM code_embeddings WHERE project_name = ?`
      : `SELECT COUNT(*) as total_files, SUM(token_count) as total_tokens, MAX(indexed_at) as last_indexed FROM code_embeddings`;
    
    const result = projectName
      ? this.db.prepare(sql).get(projectName) as { total_files: number; total_tokens: number; last_indexed: string | null }
      : this.db.prepare(sql).get() as { total_files: number; total_tokens: number; last_indexed: string | null };
    
    return result;
  }

  listIndexedProjects(): string[] {
    const rows = this.db.prepare(`SELECT DISTINCT project_name FROM code_embeddings`).all() as Array<{ project_name: string }>;
    return rows.map(r => r.project_name);
  }

  /**
   * Récupère les métadonnées légères des fichiers indexés (sans embedding ni contenu)
   * Utilisé pour la comparaison rapide au démarrage
   */
  getCodeEmbeddingMetadata(projectName: string): Map<string, { content_hash: string; last_modified: string }> {
    const rows = this.db.prepare(`
      SELECT file_path, content_hash, last_modified
      FROM code_embeddings WHERE project_name = ?
    `).all(projectName) as Array<{ file_path: string; content_hash: string; last_modified: string }>;

    const result = new Map<string, { content_hash: string; last_modified: string }>();
    for (const row of rows) {
      result.set(row.file_path, {
        content_hash: row.content_hash,
        last_modified: row.last_modified
      });
    }
    return result;
  }

  // ============ Telegram Master ============

  getTelegramMaster(): { user_id: number | null; username: string | null } | null {
    const row = this.db.prepare(`
      SELECT user_id, username FROM telegram_master WHERE id = 1
    `).get() as { user_id: number | null; username: string | null } | undefined;
    return row || null;
  }

  setTelegramMaster(userId: number | null, username: string | null): void {
    this.db.prepare(`
      INSERT INTO telegram_master (id, user_id, username, set_at)
      VALUES (1, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        username = excluded.username,
        set_at = datetime('now')
    `).run(userId, username);
  }

  // ============ Webapp Settings ============

  getWebappSettings(): { showAllSources: boolean } {
    const value = this.getConfig('webapp.showAllSources');
    return {
      showAllSources: value === 'true'
    };
  }

  setWebappSettings(settings: { showAllSources: boolean }): void {
    this.setConfig('webapp.showAllSources', settings.showAllSources ? 'true' : 'false');
  }

  // ============ Cleanup ============

  close(): void {
    this.db.close();
  }

  clearSession(sessionId?: string): void {
    const sid = sessionId || this.currentSessionId;
    this.db.prepare(`DELETE FROM conversations WHERE session_id = ?`).run(sid);
  }
}

// Singleton instance
let memoryInstance: Memory | null = null;

export function getMemory(): Memory {
  if (!memoryInstance) {
    memoryInstance = new Memory();
  }
  return memoryInstance;
}
