/**
 * Système de gestion de l'annulation des tool calls
 *
 * Permet d'annuler l'exécution des tools longs (recherche, téléchargement, etc.)
 * via un AbortController partagé.
 */

import { logger } from './logger';

interface ActiveExecution {
  controller: AbortController;
  toolName: string;
  threadId: string;
  startTime: Date;
}

// Map des exécutions actives par threadId
const activeExecutions = new Map<string, ActiveExecution>();

/**
 * Crée un nouveau contexte d'exécution avec AbortController
 */
export function createExecutionContext(
  toolName: string,
  threadId: string
): { signal: AbortSignal; executionId: string } {
  const controller = new AbortController();
  const executionId = `${threadId}_${toolName}_${Date.now()}`;

  // Annuler toute exécution précédente sur ce thread
  cancelThreadExecution(threadId, 'new_execution_started');

  activeExecutions.set(threadId, {
    controller,
    toolName,
    threadId,
    startTime: new Date()
  });

  logger.debug('ToolCancellation', `Created execution context for ${toolName} on thread ${threadId}`);

  return { signal: controller.signal, executionId };
}

/**
 * Annule l'exécution en cours sur un thread
 */
export function cancelThreadExecution(threadId: string, reason: string = 'user_cancelled'): boolean {
  const execution = activeExecutions.get(threadId);

  if (!execution) {
    logger.debug('ToolCancellation', `No active execution to cancel on thread ${threadId}`);
    return false;
  }

  logger.info('ToolCancellation', `Cancelling ${execution.toolName} on thread ${threadId}: ${reason}`);

  execution.controller.abort(reason);
  activeExecutions.delete(threadId);

  return true;
}

/**
 * Libère le contexte d'exécution (appelé à la fin du tool, qu'il réussisse ou échoue)
 */
export function releaseExecutionContext(threadId: string): void {
  const execution = activeExecutions.get(threadId);

  if (execution) {
    logger.debug('ToolCancellation', `Releasing execution context for ${execution.toolName} on thread ${threadId}`);
    activeExecutions.delete(threadId);
  }
}

/**
 * Vérifie si une exécution est active sur un thread
 */
export function isExecutionActive(threadId: string): boolean {
  return activeExecutions.has(threadId);
}

/**
 * Récupère les infos sur l'exécution active d'un thread
 */
export function getActiveExecution(threadId: string): ActiveExecution | undefined {
  return activeExecutions.get(threadId);
}

/**
 * Liste toutes les exécutions actives
 */
export function getAllActiveExecutions(): ActiveExecution[] {
  return Array.from(activeExecutions.values());
}

/**
 * Vérifie si un signal est annulé et lève une erreur si c'est le cas
 * À utiliser dans les boucles longues des tools
 */
export function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error(`Tool execution cancelled: ${signal.reason || 'user_cancelled'}`);
  }
}

/**
 * Wrapper pour exécuter une fonction avec support de l'annulation
 */
export async function withCancellation<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  toolName: string,
  threadId: string
): Promise<T> {
  const { signal } = createExecutionContext(toolName, threadId);

  try {
    const result = await fn(signal);
    return result;
  } finally {
    releaseExecutionContext(threadId);
  }
}
