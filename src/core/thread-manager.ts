/**
 * ThreadManager - Gestion des threads de conversation multiples
 * 
 * Permet de:
 * - Créer des threads indépendants (ou sous-threads d'un thread parent)
 * - Basculer entre threads
 * - Gérer l'historique par thread
 * - Naviguer dans plusieurs onglets simultanément
 */

import { getMemory } from './memory.js';
import { logger } from './logger.js';

export interface Thread {
  id: string;
  parentThreadId: string | null;
  title: string;
  isMain: boolean;
  source: 'webapp' | 'telegram' | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadMessage {
  id: number;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: Array<{ id?: string; name: string; input: unknown }>;
  toolCallId?: string;  // Pour les messages de type 'tool'
  images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
}

export interface ThreadStats {
  totalThreads: number;
  totalMessages: number;
  activeThreadId: string | null;
}

export class ThreadManager {
  private memory = getMemory();
  private activeThreads: Map<string, string> = new Map(); // clientId -> threadId
  private db: any;

  constructor() {
    this.db = (this.memory as any).db;
    this.ensureMainThread();
  }

  /**
   * Crée un thread principal si aucun n'existe
   */
  private ensureMainThread(): void {
    const mainThread = this.db.prepare(`
      SELECT id FROM threads WHERE is_main = 1 ORDER BY created_at DESC LIMIT 1
    `).get() as { id: string } | undefined;

    if (!mainThread) {
      this.createThread('Main Conversation', null, true);
      logger.info('ThreadManager', 'Main thread created');
    }
  }

  /**
   * Crée un nouveau thread
   * @param title Titre du thread
   * @param parentThreadId ID du thread parent (optionnel, pour les sous-threads)
   * @param isMain Si c'est le thread principal
   * @param source Source de la conversation (webapp/telegram)
   * @returns L'ID du thread créé
   */
  createThread(
    title: string = 'New Thread',
    parentThreadId: string | null = null,
    isMain: boolean = false,
    source: 'webapp' | 'telegram' | null = null
  ): string {
    const id = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    this.db.prepare(`
      INSERT INTO threads (id, parent_thread_id, title, is_main, source)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, parentThreadId, title, isMain ? 1 : 0, source);

    logger.info('ThreadManager', `Thread created: ${id} (title: ${title}, parent: ${parentThreadId || 'none'})`);
    return id;
  }

  /**
   * Crée un sous-thread d'un thread existant
   * @param parentThreadId ID du thread parent
   * @param title Titre du sous-thread
   * @returns L'ID du sous-thread créé
   */
  createSubThread(parentThreadId: string, title: string = 'Sub Thread'): string {
    // Vérifie que le parent existe
    const parent = this.getThread(parentThreadId);
    if (!parent) {
      throw new Error(`Parent thread ${parentThreadId} not found`);
    }

    return this.createThread(title, parentThreadId, false, parent.source);
  }

  /**
   * Récupère un thread par son ID
   */
  getThread(threadId: string): Thread | null {
    const row = this.db.prepare(`
      SELECT id, parent_thread_id, title, is_main, source, created_at, updated_at
      FROM threads WHERE id = ?
    `).get(threadId) as {
      id: string;
      parent_thread_id: string | null;
      title: string;
      is_main: number;
      source: 'webapp' | 'telegram' | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      parentThreadId: row.parent_thread_id,
      title: row.title,
      isMain: row.is_main === 1,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Liste tous les threads
   * @param includeSubThreads Si false, n'inclut que les threads principaux
   */
  listThreads(includeSubThreads: boolean = true): Thread[] {
    let query = `
      SELECT id, parent_thread_id, title, is_main, source, created_at, updated_at
      FROM threads
    `;
    
    if (!includeSubThreads) {
      query += ` WHERE is_main = 1`;
    }
    
    query += ` ORDER BY updated_at DESC`;

    const rows = this.db.prepare(query).all() as Array<{
      id: string;
      parent_thread_id: string | null;
      title: string;
      is_main: number;
      source: 'webapp' | 'telegram' | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      parentThreadId: row.parent_thread_id,
      title: row.title,
      isMain: row.is_main === 1,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Récupère les sous-threads d'un thread parent
   */
  getSubThreads(parentThreadId: string): Thread[] {
    const rows = this.db.prepare(`
      SELECT id, parent_thread_id, title, is_main, source, created_at, updated_at
      FROM threads WHERE parent_thread_id = ?
      ORDER BY created_at ASC
    `).all(parentThreadId) as Array<{
      id: string;
      parent_thread_id: string | null;
      title: string;
      is_main: number;
      source: 'webapp' | 'telegram' | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      parentThreadId: row.parent_thread_id,
      title: row.title,
      isMain: row.is_main === 1,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Définit le thread actif pour un client donné
   * @param clientId Identifiant unique du client (socket id ou browser tab id)
   * @param threadId ID du thread
   */
  setActiveThread(clientId: string, threadId: string): void {
    // Vérifie que le thread existe
    const thread = this.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    this.activeThreads.set(clientId, threadId);
    logger.info('ThreadManager', `Thread ${threadId} activated for client ${clientId}`);
  }

  /**
   * Récupère le thread actif pour un client
   */
  getActiveThread(clientId: string): string | null {
    return this.activeThreads.get(clientId) || null;
  }

  /**
   * Supprime un thread et tous ses messages (et sous-threads récursivement)
   */
  deleteThread(threadId: string): boolean {
    const thread = this.getThread(threadId);
    if (!thread) return false;

    // Supprime récursivement les sous-threads
    const subThreads = this.getSubThreads(threadId);
    for (const subThread of subThreads) {
      this.deleteThread(subThread.id);
    }

    // Supprime le thread (les messages seront supprimés par CASCADE)
    this.db.prepare(`DELETE FROM threads WHERE id = ?`).run(threadId);

    // Supprime des threads actifs
    for (const [clientId, activeThreadId] of this.activeThreads.entries()) {
      if (activeThreadId === threadId) {
        this.activeThreads.delete(clientId);
      }
    }

    logger.info('ThreadManager', `Thread ${threadId} deleted`);
    return true;
  }

  /**
   * Renomme un thread
   */
  renameThread(threadId: string, newTitle: string): boolean {
    const result = this.db.prepare(`
      UPDATE threads SET title = ?, updated_at = datetime('now') WHERE id = ?
    `).run(newTitle, threadId);

    return result.changes > 0;
  }

  /**
   * Met à jour le timestamp du thread
   */
  touchThread(threadId: string): void {
    this.db.prepare(`
      UPDATE threads SET updated_at = datetime('now') WHERE id = ?
    `).run(threadId);
  }

  /**
   * Compte le nombre de messages dans un thread
   */
  getThreadMessageCount(threadId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM conversations WHERE thread_id = ?
    `).get(threadId) as { count: number };
    return result?.count || 0;
  }

  /**
   * Récupère les messages d'un thread (les plus récents d'abord, puis inversés pour l'affichage)
   * @param threadId ID du thread
   * @param limit Nombre de messages à récupérer
   * @param offset Décalage depuis les messages les plus récents
   */
  getThreadMessages(threadId: string, limit: number = 100, offset: number = 0): ThreadMessage[] {
    // Récupère les N messages les plus récents avec offset, puis les inverse pour l'ordre chronologique
    // EXCLUT les messages compressés (compression_summary IS NULL)
    const rows = this.db.prepare(`
      SELECT * FROM (
        SELECT c.id, c.thread_id, c.role, c.content, c.timestamp, c.tool_calls, c.images
        FROM conversations c
        WHERE c.thread_id = ? AND c.compression_summary IS NULL
        ORDER BY c.id DESC
        LIMIT ? OFFSET ?
      ) ORDER BY id ASC
    `).all(threadId, limit, offset) as Array<{
      id: number;
      thread_id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp: string;
      tool_calls?: string;
      images?: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      threadId: row.thread_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      images: row.images ? JSON.parse(row.images) : undefined,
    }));
  }

  /**
   * Ajoute un message à un thread
   */
  addMessage(
    threadId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    toolCalls?: Array<{ id?: string; name: string; input: unknown }>,
    images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>
  ): number {
    // Génère un session_id unique pour ce message
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const result = this.db.prepare(`
      INSERT INTO conversations (thread_id, session_id, role, content, tool_calls, images, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      threadId,
      sessionId,
      role,
      content,
      toolCalls ? JSON.stringify(toolCalls) : null,
      images ? JSON.stringify(images) : null,
      new Date().toISOString()
    );

    // Met à jour le timestamp du thread
    this.touchThread(threadId);

    return result.lastInsertRowid as number;
  }

  /**
   * Efface tous les messages d'un thread (mais garde le thread)
   */
  clearThreadMessages(threadId: string): void {
    this.db.prepare(`DELETE FROM conversations WHERE thread_id = ?`).run(threadId);
    logger.info('ThreadManager', `Messages cleared for thread ${threadId}`);
  }

  /**
   * Ajoute un résultat d'outil à un thread
   * Format spécial: __TOOL_RESULT__{toolUseId}__{result}
   */
  addToolResult(threadId: string, toolUseId: string, result: string): number {
    const content = `__TOOL_RESULT__${toolUseId}__${result}`;
    return this.addMessage(threadId, 'user', content);
  }

  /**
   * Récupère les statistiques des threads
   */
  getStats(): ThreadStats {
    const threadCount = this.db.prepare(`SELECT COUNT(*) as count FROM threads`).get() as { count: number };
    const messageCount = this.db.prepare(`SELECT COUNT(*) as count FROM conversations`).get() as { count: number };

    return {
      totalThreads: threadCount.count,
      totalMessages: messageCount.count,
      activeThreadId: this.activeThreads.size > 0 ? Array.from(this.activeThreads.values())[0] : null,
    };
  }

  /**
   * Récupère ou crée le thread principal pour une source donnée
   * @param source Source de la conversation (webapp/telegram)
   * @param identifier Identifiant unique (ex: telegram userId)
   * @returns Le thread principal existant ou nouvellement créé
   */
  getOrCreateMainThread(source: 'webapp' | 'telegram', identifier?: string): Thread {
    // Pour telegram, on utilise un ID déterministe basé sur le userId
    const threadIdPrefix = source === 'telegram' && identifier
      ? `thread_telegram_${identifier}`
      : null;

    // Cherche un thread main existant pour cette source/identifier
    let query = `
      SELECT id, parent_thread_id, title, is_main, source, created_at, updated_at
      FROM threads WHERE is_main = 1 AND source = ?
    `;
    const params: any[] = [source];

    if (threadIdPrefix) {
      query += ` AND id LIKE ?`;
      params.push(`${threadIdPrefix}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT 1`;

    const row = this.db.prepare(query).get(...params) as {
      id: string;
      parent_thread_id: string | null;
      title: string;
      is_main: number;
      source: 'webapp' | 'telegram' | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (row) {
      return {
        id: row.id,
        parentThreadId: row.parent_thread_id,
        title: row.title,
        isMain: row.is_main === 1,
        source: row.source,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    // Crée un nouveau thread main avec un ID déterministe pour telegram
    const id = threadIdPrefix
      ? `${threadIdPrefix}_${Date.now()}`
      : `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const title = source === 'telegram'
      ? `Telegram ${identifier || 'Main'}`
      : 'Main Conversation';

    this.db.prepare(`
      INSERT INTO threads (id, parent_thread_id, title, is_main, source)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, null, title, 1, source);

    logger.info('ThreadManager', `Main thread created for ${source}: ${id}`);

    return this.getThread(id)!;
  }

  /**
   * Récupère le thread principal
   */
  getMainThread(): Thread | null {
    const row = this.db.prepare(`
      SELECT id, parent_thread_id, title, is_main, source, created_at, updated_at
      FROM threads WHERE is_main = 1
      ORDER BY created_at DESC LIMIT 1
    `).get() as {
      id: string;
      parent_thread_id: string | null;
      title: string;
      is_main: number;
      source: 'webapp' | 'telegram' | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      parentThreadId: row.parent_thread_id,
      title: row.title,
      isMain: row.is_main === 1,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Libère un client (à appeler quand un socket se déconnecte)
   */
  releaseClient(clientId: string): void {
    this.activeThreads.delete(clientId);
    logger.info('ThreadManager', `Client ${clientId} released`);
  }

  /**
   * Récupère tous les clients actifs pour un thread donné
   */
  getClientsForThread(threadId: string): string[] {
    const clients: string[] = [];
    for (const [clientId, activeThreadId] of this.activeThreads.entries()) {
      if (activeThreadId === threadId) {
        clients.push(clientId);
      }
    }
    return clients;
  }
}

// Singleton
let threadManagerInstance: ThreadManager | null = null;

export function getThreadManager(): ThreadManager {
  if (!threadManagerInstance) {
    threadManagerInstance = new ThreadManager();
  }
  return threadManagerInstance;
}

export function initThreadManager(): ThreadManager {
  threadManagerInstance = new ThreadManager();
  return threadManagerInstance;
}