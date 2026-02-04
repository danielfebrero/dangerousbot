/**
 * Tool Result Store - Persistance et récupération des résultats d'exécution de tools
 *
 * Permet à l'agent de retrouver les résultats d'exécutions passées après un redémarrage,
 * sans surcharger le contexte de conversation.
 */

import Database from 'better-sqlite3';
import { TOOL_RESULTS } from '../config.js';
import { logger } from './logger.js';
import { getDatabase } from '../database/index.js';

export interface ToolExecution {
  toolCallId: string;
  toolName: string;
  timestamp: string;
  status: 'success' | 'error';
  input: Record<string, unknown>;
  output: unknown;
  error?: string;
  metadata: {
    executionTimeMs: number;
    threadId: string;
    messageId?: number;
  };
}

export interface StoredToolExecution {
  id: number;
  tool_call_id: string;
  tool_name: string;
  timestamp: string;
  status: 'success' | 'error';
  input: string;
  output: string;
  error: string | null;
  execution_time_ms: number;
  thread_id: string;
  message_id: number | null;
  created_at: string;
}

export class ToolResultStore {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Sauvegarde une exécution de tool
   */
  saveToolExecution(execution: ToolExecution): void {
    try {
      // Vérifier la taille du résultat
      const outputStr = JSON.stringify(execution.output);
      const truncatedOutput = outputStr.length > TOOL_RESULTS.MAX_OUTPUT_SIZE_BYTES
        ? outputStr.substring(0, TOOL_RESULTS.MAX_OUTPUT_SIZE_BYTES) + '... [TRUNCATED]'
        : outputStr;

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO tool_executions
        (tool_call_id, tool_name, timestamp, status, input, output, error, execution_time_ms, thread_id, message_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        execution.toolCallId,
        execution.toolName,
        execution.timestamp,
        execution.status,
        JSON.stringify(execution.input),
        truncatedOutput,
        execution.error || null,
        execution.metadata.executionTimeMs,
        execution.metadata.threadId,
        execution.metadata.messageId || null
      );

      logger.debug('ToolResultStore', `Saved execution: ${execution.toolCallId} (${execution.toolName})`);

      // Déclencher le cleanup si nécessaire (en arrière-plan)
      this.maybeCleanup(execution.metadata.threadId);
    } catch (error) {
      logger.error('ToolResultStore', 'Failed to save tool execution', error);
    }
  }

  /**
   * Récupère une exécution par son ID
   */
  getToolExecution(toolCallId: string): ToolExecution | null {
    try {
      const row = this.db.prepare(`
        SELECT * FROM tool_executions WHERE tool_call_id = ?
      `).get(toolCallId) as StoredToolExecution | undefined;

      if (!row) return null;

      return {
        toolCallId: row.tool_call_id,
        toolName: row.tool_name,
        timestamp: row.timestamp,
        status: row.status,
        input: JSON.parse(row.input),
        output: JSON.parse(row.output),
        error: row.error || undefined,
        metadata: {
          executionTimeMs: row.execution_time_ms,
          threadId: row.thread_id,
          messageId: row.message_id || undefined
        }
      };
    } catch (error) {
      logger.error('ToolResultStore', `Failed to get execution: ${toolCallId}`, error);
      return null;
    }
  }

  /**
   * Liste les exécutions d'un thread
   */
  listToolExecutions(threadId: string, limit: number = 100): ToolExecution[] {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM tool_executions
        WHERE thread_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(threadId, limit) as StoredToolExecution[];

      return rows.map(row => ({
        toolCallId: row.tool_call_id,
        toolName: row.tool_name,
        timestamp: row.timestamp,
        status: row.status,
        input: JSON.parse(row.input),
        output: JSON.parse(row.output),
        error: row.error || undefined,
        metadata: {
          executionTimeMs: row.execution_time_ms,
          threadId: row.thread_id,
          messageId: row.message_id || undefined
        }
      }));
    } catch (error) {
      logger.error('ToolResultStore', `Failed to list executions for thread: ${threadId}`, error);
      return [];
    }
  }

  /**
   * Formate un résumé pour le contexte LLM
   * Format: [timestamp] tool_name: status | preview... [ID: xxx]
   */
  formatToolSummary(execution: ToolExecution): string {
    const preview = this.generatePreview(execution);
    return `[${execution.timestamp}] ${execution.toolName}: ${execution.status} | ${preview} [ID: ${execution.toolCallId}]`;
  }

  /**
   * Génère un aperçu du résultat (tronqué)
   */
  private generatePreview(execution: ToolExecution): string {
    try {
      let preview: string;

      if (execution.status === 'error' && execution.error) {
        preview = `ERROR: ${execution.error}`;
      } else if (typeof execution.output === 'string') {
        preview = execution.output;
      } else if (execution.output && typeof execution.output === 'object') {
        // Essayer d'extraire un message significatif
        const output = execution.output as Record<string, unknown>;
        if (output.message) {
          preview = String(output.message);
        } else if (output.result) {
          preview = String(output.result);
        } else if (output.success !== undefined) {
          preview = output.success ? 'OK' : 'FAILED';
          if (output.output) {
            preview += `: ${String(output.output).substring(0, 100)}`;
          }
        } else {
          preview = JSON.stringify(output);
        }
      } else {
        preview = String(execution.output);
      }

      // Tronquer et nettoyer
      preview = preview.replace(/\n/g, ' ').trim();
      if (preview.length > TOOL_RESULTS.SUMMARY_PREVIEW_LENGTH) {
        preview = preview.substring(0, TOOL_RESULTS.SUMMARY_PREVIEW_LENGTH) + '...';
      }

      return preview || '(empty)';
    } catch {
      return '(preview error)';
    }
  }

  /**
   * Nettoie les anciennes exécutions si nécessaire
   */
  private maybeCleanup(threadId: string): void {
    try {
      // Compter les exécutions pour ce thread
      const count = this.db.prepare(`
        SELECT COUNT(*) as count FROM tool_executions WHERE thread_id = ?
      `).get(threadId) as { count: number };

      // Rotation FIFO si dépassement
      if (count.count > TOOL_RESULTS.MAX_EXECUTIONS_PER_THREAD) {
        const toDelete = count.count - TOOL_RESULTS.MAX_EXECUTIONS_PER_THREAD;
        this.db.prepare(`
          DELETE FROM tool_executions
          WHERE id IN (
            SELECT id FROM tool_executions
            WHERE thread_id = ?
            ORDER BY timestamp ASC
            LIMIT ?
          )
        `).run(threadId, toDelete);
        logger.info('ToolResultStore', `Cleaned up ${toDelete} old executions for thread ${threadId}`);
      }
    } catch (error) {
      logger.error('ToolResultStore', 'Cleanup failed', error);
    }
  }

  /**
   * Nettoie les exécutions plus anciennes que RETENTION_DAYS
   */
  cleanupOldExecutions(): number {
    try {
      const result = this.db.prepare(`
        DELETE FROM tool_executions
        WHERE datetime(timestamp) < datetime('now', '-${TOOL_RESULTS.RETENTION_DAYS} days')
      `).run();

      if (result.changes > 0) {
        logger.info('ToolResultStore', `Cleaned up ${result.changes} executions older than ${TOOL_RESULTS.RETENTION_DAYS} days`);
      }

      return result.changes;
    } catch (error) {
      logger.error('ToolResultStore', 'Old executions cleanup failed', error);
      return 0;
    }
  }

  /**
   * Récupère les statistiques des exécutions
   */
  getStats(threadId?: string): { total: number; success: number; error: number; oldestTimestamp: string | null } {
    try {
      const whereClause = threadId ? 'WHERE thread_id = ?' : '';
      const params = threadId ? [threadId] : [];

      const total = this.db.prepare(`
        SELECT COUNT(*) as count FROM tool_executions ${whereClause}
      `).get(...params) as { count: number };

      const success = this.db.prepare(`
        SELECT COUNT(*) as count FROM tool_executions ${whereClause} ${threadId ? 'AND' : 'WHERE'} status = 'success'
      `).get(...params) as { count: number };

      const oldest = this.db.prepare(`
        SELECT MIN(timestamp) as oldest FROM tool_executions ${whereClause}
      `).get(...params) as { oldest: string | null };

      return {
        total: total.count,
        success: success.count,
        error: total.count - success.count,
        oldestTimestamp: oldest.oldest
      };
    } catch (error) {
      logger.error('ToolResultStore', 'Failed to get stats', error);
      return { total: 0, success: 0, error: 0, oldestTimestamp: null };
    }
  }

  /**
   * Ferme la connexion à la base de données
   */
  close(): void {
    this.db.close();
  }
}

// Singleton
let storeInstance: ToolResultStore | null = null;

export function getToolResultStore(): ToolResultStore {
  if (!storeInstance) {
    storeInstance = new ToolResultStore();
  }
  return storeInstance;
}
