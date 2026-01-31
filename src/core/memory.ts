/**
 * Memory - SQLite Vector Database pour DangerousBot
 * Gère la persistance des conversations et prépare pour les embeddings
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Message, Knowledge } from './types';

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
    console.log(`[Memory] Session: ${this.currentSessionId} (${lastSession ? 'reprise' : 'nouvelle'})`);
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
    // Table des conversations
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        tool_calls TEXT,
        images TEXT,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
    `);
    
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
    images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>
  ): number {
    // Vérifier si un message identique existe déjà dans les 5 dernières secondes (anti-doublon)
    const recentDuplicate = this.db.prepare(`
      SELECT id FROM conversations
      WHERE session_id = ? AND role = ? AND content = ?
      AND datetime(timestamp) > datetime('now', '-5 seconds')
      LIMIT 1
    `).get(this.currentSessionId, role, content) as { id: number } | undefined;
    
    if (recentDuplicate) {
      console.log(`[Memory] Doublon détecté et ignoré: ${role} - ${content.substring(0, 50)}...`);
      return recentDuplicate.id;
    }
    
    // Migration: ajouter la colonne images si nécessaire
    try {
      this.db.exec(`ALTER TABLE conversations ADD COLUMN images TEXT`);
    } catch (e) {
      // Colonne existe déjà
    }
    
    const stmt = this.db.prepare(`
      INSERT INTO conversations (session_id, role, content, tool_calls, images, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      this.currentSessionId,
      role,
      content,
      toolCalls ? JSON.stringify(toolCalls) : null,
      images ? JSON.stringify(images) : null,
      new Date().toISOString()
    );
    return result.lastInsertRowid as number;
  }

  getMessages(sessionId?: string, limit: number = 100): (Message & { images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> })[] {
    const sid = sessionId || this.currentSessionId;
    // Prendre les N plus récents (ORDER BY id DESC), puis inverser pour avoir l'ordre chronologique
    const rows = this.db.prepare(`
      SELECT id, session_id, role, content, tool_calls, images, timestamp
      FROM conversations
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(sid, limit) as Array<Message & { tool_calls?: string; images?: string }>;
    
    // Inverser pour ordre chronologique + parser les JSON
    return rows.reverse().map(row => ({
      ...row,
      tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      images: row.images ? JSON.parse(row.images) : undefined
    }));
  }

  getRecentMessages(count: number = 20): Message[] {
    const rows = this.db.prepare(`
      SELECT id, session_id, role, content, tool_calls, timestamp
      FROM conversations
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(this.currentSessionId, count) as Array<Message & { tool_calls?: string }>;
    
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

  getStats(): { sessions: number; messages: number; knowledge: number } {
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
    lastModified?: string
  ): number {
    const buffer = Buffer.from(new Float64Array(embedding).buffer);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO code_embeddings 
      (file_path, content, content_hash, embedding, token_count, file_size, last_modified, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const result = stmt.run(
      filePath,
      content,
      contentHash,
      buffer,
      tokenCount || 0,
      fileSize || 0,
      lastModified || new Date().toISOString()
    );
    return result.lastInsertRowid as number;
  }

  getCodeEmbedding(filePath: string): { id: number; file_path: string; content: string; content_hash: string; embedding: number[]; token_count: number; indexed_at: string } | null {
    const row = this.db.prepare(`
      SELECT id, file_path, content, content_hash, embedding, token_count, indexed_at
      FROM code_embeddings WHERE file_path = ?
    `).get(filePath) as { id: number; file_path: string; content: string; content_hash: string; embedding: Buffer; token_count: number; indexed_at: string } | undefined;
    
    if (!row) return null;
    
    // Convertir le buffer en array de nombres
    const floatArray = new Float64Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 8);
    
    return {
      ...row,
      embedding: Array.from(floatArray)
    };
  }

  getAllCodeEmbeddings(): Array<{ id: number; file_path: string; content: string; embedding: number[] }> {
    const rows = this.db.prepare(`
      SELECT id, file_path, content, embedding FROM code_embeddings
    `).all() as Array<{ id: number; file_path: string; content: string; embedding: Buffer }>;
    
    return rows.map(row => {
      const floatArray = new Float64Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 8);
      return {
        ...row,
        embedding: Array.from(floatArray)
      };
    });
  }

  deleteCodeEmbedding(filePath: string): void {
    this.db.prepare(`DELETE FROM code_embeddings WHERE file_path = ?`).run(filePath);
  }

  getCodeEmbeddingStats(): { total_files: number; total_tokens: number; last_indexed: string | null } {
    const result = this.db.prepare(`
      SELECT 
        COUNT(*) as total_files,
        SUM(token_count) as total_tokens,
        MAX(indexed_at) as last_indexed
      FROM code_embeddings
    `).get() as { total_files: number; total_tokens: number; last_indexed: string | null };
    
    return result;
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
