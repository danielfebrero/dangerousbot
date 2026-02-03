/**
 * TokenTracker - Service de suivi des tokens en temps réel
 *
 * Fonctionnalités:
 * - Estimation du contexte actuel (messages dans l'historique)
 * - Tracking cumulatif des tokens utilisés par thread/session
 * - Calcul des coûts
 */

import { getThreadManager } from './thread-manager';
import { logger } from './logger';

// Heuristique: ~4 caractères par token en moyenne (varie selon le contenu)
const CHARS_PER_TOKEN = 4;

// Prix par million de tokens (Claude Opus 4.5 par défaut)
const DEFAULT_INPUT_COST_PER_MILLION = 15.0;  // $15 per 1M input tokens
const DEFAULT_OUTPUT_COST_PER_MILLION = 75.0; // $75 per 1M output tokens

export interface TokenStats {
  // Contexte actuel estimé
  estimatedContextTokens: number;

  // Cumulatif pour cette session (depuis connexion)
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionTotalCost: number;

  // Dernier appel API
  lastRequestInputTokens: number;
  lastRequestOutputTokens: number;
  lastRequestCost: number;

  // Limite de contexte (pour afficher une jauge)
  contextLimit: number;
  contextUsagePercent: number;
}

export interface ThreadTokenState {
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionTotalCost: number;
  lastRequestInputTokens: number;
  lastRequestOutputTokens: number;
  lastRequestCost: number;
}

export class TokenTracker {
  private threadStats: Map<string, ThreadTokenState> = new Map();
  private contextLimit: number;
  private inputCostPerMillion: number;
  private outputCostPerMillion: number;

  constructor(contextLimit: number = 128000) {
    this.contextLimit = contextLimit;
    this.inputCostPerMillion = DEFAULT_INPUT_COST_PER_MILLION;
    this.outputCostPerMillion = DEFAULT_OUTPUT_COST_PER_MILLION;
  }

  /**
   * Configure les coûts par token (peut varier selon le provider)
   */
  setCostConfig(inputCostPerMillion: number, outputCostPerMillion: number): void {
    this.inputCostPerMillion = inputCostPerMillion;
    this.outputCostPerMillion = outputCostPerMillion;
  }

  /**
   * Estime le nombre de tokens dans un texte
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Estime le nombre de tokens dans le contexte actuel d'un thread
   */
  estimateContextTokens(threadId: string): number {
    try {
      const threadManager = getThreadManager();
      const messages = threadManager.getThreadMessages(threadId, 1000);

      let totalTokens = 0;

      for (const msg of messages) {
        // Estimer les tokens du contenu
        if (typeof msg.content === 'string') {
          totalTokens += this.estimateTokens(msg.content);
        }

        // Ajouter un overhead pour les métadonnées (role, timestamp, etc.)
        totalTokens += 10;

        // Si le message a des tool_calls, estimer leurs tokens
        if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
          for (const tc of msg.toolCalls) {
            totalTokens += this.estimateTokens(tc.name || '');
            totalTokens += this.estimateTokens(JSON.stringify(tc.input || {}));
          }
        }
      }

      // Ajouter un overhead pour le system prompt (~2000 tokens typiquement)
      totalTokens += 2000;

      return totalTokens;
    } catch (error) {
      logger.error('TokenTracker', 'Failed to estimate context tokens:', error);
      return 0;
    }
  }

  /**
   * Met à jour les stats après un appel API
   */
  recordApiCall(
    threadId: string,
    inputTokens: number,
    outputTokens: number,
    cost?: { input_cost: number; output_cost: number; total_cost: number }
  ): void {
    let state = this.threadStats.get(threadId);

    if (!state) {
      state = {
        sessionInputTokens: 0,
        sessionOutputTokens: 0,
        sessionTotalCost: 0,
        lastRequestInputTokens: 0,
        lastRequestOutputTokens: 0,
        lastRequestCost: 0
      };
      this.threadStats.set(threadId, state);
    }

    // Calculer le coût si non fourni
    const requestCost = cost?.total_cost ??
      ((inputTokens / 1_000_000) * this.inputCostPerMillion +
       (outputTokens / 1_000_000) * this.outputCostPerMillion);

    // Mettre à jour les stats
    state.sessionInputTokens += inputTokens;
    state.sessionOutputTokens += outputTokens;
    state.sessionTotalCost += requestCost;
    state.lastRequestInputTokens = inputTokens;
    state.lastRequestOutputTokens = outputTokens;
    state.lastRequestCost = requestCost;

    logger.debug('TokenTracker', `Thread ${threadId}: +${inputTokens}in +${outputTokens}out ($${requestCost.toFixed(4)})`);
  }

  /**
   * Récupère les stats complètes pour un thread
   */
  getStats(threadId: string): TokenStats {
    const state = this.threadStats.get(threadId) || {
      sessionInputTokens: 0,
      sessionOutputTokens: 0,
      sessionTotalCost: 0,
      lastRequestInputTokens: 0,
      lastRequestOutputTokens: 0,
      lastRequestCost: 0
    };

    const estimatedContextTokens = this.estimateContextTokens(threadId);
    const contextUsagePercent = Math.min(100, (estimatedContextTokens / this.contextLimit) * 100);

    return {
      estimatedContextTokens,
      sessionInputTokens: state.sessionInputTokens,
      sessionOutputTokens: state.sessionOutputTokens,
      sessionTotalCost: state.sessionTotalCost,
      lastRequestInputTokens: state.lastRequestInputTokens,
      lastRequestOutputTokens: state.lastRequestOutputTokens,
      lastRequestCost: state.lastRequestCost,
      contextLimit: this.contextLimit,
      contextUsagePercent
    };
  }

  /**
   * Récupère les stats avec des tokens "pending" en cours de streaming
   * Permet d'afficher les updates en temps réel avant que l'appel API soit finalisé
   */
  getStatsWithPending(
    threadId: string,
    pendingInputTokens: number,
    pendingOutputTokens: number
  ): TokenStats {
    const state = this.threadStats.get(threadId) || {
      sessionInputTokens: 0,
      sessionOutputTokens: 0,
      sessionTotalCost: 0,
      lastRequestInputTokens: 0,
      lastRequestOutputTokens: 0,
      lastRequestCost: 0
    };

    // Calculer le coût estimé des tokens en cours
    const pendingCost =
      (pendingInputTokens / 1_000_000) * this.inputCostPerMillion +
      (pendingOutputTokens / 1_000_000) * this.outputCostPerMillion;

    const estimatedContextTokens = this.estimateContextTokens(threadId);
    const contextUsagePercent = Math.min(100, (estimatedContextTokens / this.contextLimit) * 100);

    return {
      estimatedContextTokens,
      // Ajouter les tokens pending aux totaux de session
      sessionInputTokens: state.sessionInputTokens + pendingInputTokens,
      sessionOutputTokens: state.sessionOutputTokens + pendingOutputTokens,
      sessionTotalCost: state.sessionTotalCost + pendingCost,
      // Les tokens pending sont les "derniers" tokens en cours
      lastRequestInputTokens: pendingInputTokens,
      lastRequestOutputTokens: pendingOutputTokens,
      lastRequestCost: pendingCost,
      contextLimit: this.contextLimit,
      contextUsagePercent
    };
  }

  /**
   * Réinitialise les stats d'un thread (après compression par exemple)
   */
  resetContextEstimate(threadId: string): TokenStats {
    // Les stats cumulatives restent, mais on recalcule le contexte
    return this.getStats(threadId);
  }

  /**
   * Efface les stats d'un thread
   */
  clearThread(threadId: string): void {
    this.threadStats.delete(threadId);
  }

  /**
   * Efface toutes les stats
   */
  clearAll(): void {
    this.threadStats.clear();
  }
}

// Singleton
let trackerInstance: TokenTracker | null = null;

export function getTokenTracker(): TokenTracker {
  if (!trackerInstance) {
    trackerInstance = new TokenTracker();
  }
  return trackerInstance;
}

export function initTokenTracker(contextLimit?: number): TokenTracker {
  trackerInstance = new TokenTracker(contextLimit);
  return trackerInstance;
}
