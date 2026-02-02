/**
 * Memory - SQLite Vector Database pour DangerousBot
 * Gère la persistance des conversations et prépare pour les embeddings
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Message, Knowledge, Stats } from './types';
import { logger } from './logger';

const DATA_DIR = path.join(os.homedir(), '.dangerousbot', 'data');
const DB_PATH = path.join(DATA_DIR, 'dangerousbot.db');

export class Memory {
  private db: Database.Database;
  private currentSessionId: string;

  constructor() {
    this.ensureDataDir();
    this.db = new Database(DB_PATH);
    this.initSchema();
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

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initSchema(): void {
    // Table des threads (conversations principales et sous-threads)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        parent_thread_id TEXT,
        title TEXT,
        is_main BOOLEAN DEFAULT 1,
        source TEXT CHECK(source IN ('webapp', 'telegram')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (parent_thread_id) REFERENCES threads(id)
      );
      CREATE INDEX IF NOT EXISTS idx_threads_parent ON threads(parent_thread_id);
      CREATE INDEX IF NOT EXISTS idx_threads_is_main ON threads(is_main);
    `);

    // Vérifier si la table conversations existe déjà (ancienne version sans thread_id)
    const tableInfo = this.db.prepare(`PRAGMA table_info(conversations)`).all() as Array<{ name: string }>;
    const hasThreadId = tableInfo.some(col => col.name === 'thread_id');

    if (tableInfo.length > 0 && !hasThreadId) {
      // Migration: ancienne table conversations vers nouvelle structure avec thread_id
      // 1. Créer un main thread par défaut
      const mainThreadId = `thread_main_${Date.now()}`;
      this.db.prepare(`INSERT OR IGNORE INTO threads (id, title, is_main) VALUES (?, ?, ?)`).run(mainThreadId, 'Main Thread', 1);

      // 2. Ajouter la colonne thread_id avec une valeur par défaut
      this.db.exec(`ALTER TABLE conversations ADD COLUMN thread_id TEXT`);

      // 3. Mettre à jour tous les messages existants pour utiliser le main thread
      this.db.prepare(`UPDATE conversations SET thread_id = ? WHERE thread_id IS NULL`).run(mainThreadId);
    }

    // Table des conversations (messages liés à un thread)
    // Note: CREATE TABLE IF NOT EXISTS ne modifie pas une table existante
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
    `);

    // Index pour thread_id (créé séparément car la colonne peut avoir été ajoutée par migration)
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_thread ON conversations(thread_id)`);
    } catch (e) {
      // Index existe déjà ou colonne n'existe pas encore
    }

    // Migration: ajouter la colonne tool_calls si elle n'existe pas
    try {
      this.db.exec(`ALTER TABLE conversations ADD COLUMN tool_calls TEXT`);
    } catch (e) {
      // Colonne existe déjà, ignorer
    }

    // Migration: ajouter la colonne images si elle n'existe pas
    try {
      this.db.exec(`ALTER TABLE conversations ADD COLUMN images TEXT`);
    } catch (e) {
      // Colonne existe déjà, ignorer
    }

    // Migration: ajouter la colonne source si elle n'existe pas
    try {
      this.db.exec(`ALTER TABLE conversations ADD COLUMN source TEXT CHECK(source IN ('webapp', 'telegram'))`);
    } catch (e) {
      // Colonne existe déjà, ignorer
    }

    // Index pour source (après la migration)
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)`);
    } catch (e) {
      // Index existe déjà, ignorer
    }

    // Migration: ajouter la colonne project_name à code_embeddings si elle n'existe pas
    try {
      this.db.exec(`ALTER TABLE code_embeddings ADD COLUMN project_name TEXT DEFAULT 'dangerousbot'`);
    } catch (e) {
      // Colonne existe déjà, ignorer
    }

    // Index pour project_name (après la migration)
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_code_embeddings_project ON code_embeddings(project_name)`);
    } catch (e) {
      // Index existe déjà, ignorer
    }

    // Table des embeddings (préparé pour le futur)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER,
        vector BLOB,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
    `);

    // Table des embeddings de code source (pour retrieve_code)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding BLOB NOT NULL,
        token_count INTEGER,
        file_size INTEGER,
        last_modified TEXT,
        indexed_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_code_embeddings_path ON code_embeddings(file_path);
      CREATE INDEX IF NOT EXISTS idx_code_embeddings_hash ON code_embeddings(content_hash);
    `);

    // Table des connaissances
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'context', 'skill')),
        content TEXT NOT NULL,
        embedding BLOB,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Table de configuration
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Table du master user Telegram
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_master (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        user_id INTEGER,
        username TEXT,
        set_at TEXT DEFAULT (datetime('now'))
      );
    `);
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
    source?: 'webapp' | 'telegram'
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
    
    // Migration: ajouter les colonnes si nécessaire
    try {
      this.db.exec(`ALTER TABLE conversations ADD COLUMN images TEXT`);
    } catch (e) {
      // Colonne existe déjà
    }
    
    try {
      this.db.exec(`ALTER TABLE conversations ADD COLUMN source TEXT CHECK(source IN ('webapp', 'telegram'))`);
    } catch (e) {
      // Colonne existe déjà
    }
    
    // Rétrocompatibilité: récupérer ou créer le main thread
    let mainThread = this.db.prepare(`SELECT id FROM threads WHERE is_main = 1 ORDER BY created_at DESC LIMIT 1`).get() as { id: string } | undefined;
    if (!mainThread) {
      // Créer le main thread s'il n'existe pas
      const mainThreadId = `thread_main_${Date.now()}`;
      this.db.prepare(`INSERT INTO threads (id, title, is_main) VALUES (?, ?, ?)`).run(mainThreadId, 'Main Thread', 1);
      mainThread = { id: mainThreadId };
    }
    const threadId = mainThread.id;
    
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
    sourceFilter?: 'webapp' | 'telegram' | null
  ): (Message & { images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>; source?: 'webapp' | 'telegram' })[] {
    const sid = sessionId || this.currentSessionId;
    
    // Construire la requête avec filtre optionnel
    let query = `
      SELECT id, session_id, role, content, tool_calls, images, source, timestamp
      FROM conversations
      WHERE session_id = ?
    `;
    const params: (string | number)[] = [sid];
    
    if (sourceFilter) {
      query += ` AND (source = ? OR source IS NULL)`;
      params.push(sourceFilter);
    }
    
    query += ` ORDER BY id DESC LIMIT ?`;
    params.push(limit);
    
    const rows = this.db.prepare(query).all(...params) as Array<Message & { tool_calls?: string; images?: string; source?: 'webapp' | 'telegram' }>;
    
    // Inverser pour ordre chronologique + parser les JSON
    return rows.reverse().map(row => ({
      ...row,
      tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      images: row.images ? JSON.parse(row.images) : undefined
    }));
  }

  getRecentMessages(count: number = 20, sourceFilter?: 'webapp' | 'telegram' | null): Message[] {
    let query = `
      SELECT id, session_id, role, content, tool_calls, source, timestamp
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
    
    const rows = this.db.prepare(query).all(...params) as Array<Message & { tool_calls?: string; source?: 'webapp' | 'telegram' }>;
    
    return rows.reverse().map(row => ({
      ...row,
      tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined
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

  // ============ Embeddings (préparé pour le futur) ============

  addEmbedding(conversationId: number, vector: Buffer, metadata: Record<string, unknown>): number {
    const stmt = this.db.prepare(`
      INSERT INTO embeddings (conversation_id, vector, metadata)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(conversationId, vector, JSON.stringify(metadata));
    return result.lastInsertRowid as number;
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
