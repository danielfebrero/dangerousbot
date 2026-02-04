/**
 * AIConsultant - Service de consultation multi-modèles IA
 *
 * Permet de consulter différents modèles IA (Mistral, Grok, etc.) pour:
 * - Obtenir un second avis
 * - Brainstormer
 * - Valider des idées
 * - Déléguer des tâches
 *
 * Supporte le multi-turn avec historique de conversation persistant.
 * Utilise les core providers (src/core/providers/) pour les appels API.
 */

import { TOKENS, MODELS, APIS } from "../config.js";
import { createProvider } from './providers/index.js';
import type { AIProvider as CoreAIProvider } from './providers/types.js';
import Database from 'better-sqlite3';
import { getDatabase } from '../database/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type AIComplexity = "low" | "medium" | "high" | "auto";
export type AIModel = "mistral" | "grok";

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  model?: string;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
  model: AIModel;
  metadata?: Record<string, unknown>;
}

export interface ConsultRequest {
  query: string;
  context?: string;
  complexity?: AIComplexity;
  model?: AIModel;
  forceModelSize?: "large" | "medium" | "small";
  conversationId?: string;
  systemPrompt?: string;
}

export interface ConsultResponse {
  response: string;
  model: string;
  modelSize: string;
  reasoning: string;
  conversationId?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ============================================================================
// MODEL SELECTION
// ============================================================================

function selectMistralModel(complexity: AIComplexity, query: string, forceModelSize?: string): { model: string; reasoning: string } {
  if (forceModelSize) {
    const modelMap: Record<string, string> = {
      large: MODELS.MISTRAL_LARGE,
      medium: MODELS.MISTRAL_MEDIUM,
      small: MODELS.MISTRAL_SMALL,
    };
    return { model: modelMap[forceModelSize] || MODELS.MISTRAL_MEDIUM, reasoning: `Modèle forcé: ${forceModelSize}` };
  }

  if (complexity !== "auto") {
    const modelMap = {
      low: MODELS.MISTRAL_SMALL,
      medium: MODELS.MISTRAL_MEDIUM,
      high: MODELS.MISTRAL_LARGE,
    };
    return { model: modelMap[complexity], reasoning: `Complexité spécifiée: ${complexity}` };
  }

  // Auto-détection basée sur des heuristiques
  const queryLower = query.toLowerCase();

  const highComplexityIndicators = [
    "architecture", "design", "security", "critical", "review",
    "optimize", "refactor", "complex", "strategy", "decision"
  ];

  const lowComplexityIndicators = [
    "format", "convert", "simple", "quick", "list", "generate data",
    "json", "example", "template"
  ];

  const hasHighIndicator = highComplexityIndicators.some(i => queryLower.includes(i));
  const hasLowIndicator = lowComplexityIndicators.some(i => queryLower.includes(i));

  if (hasHighIndicator && !hasLowIndicator) {
    return { model: MODELS.MISTRAL_LARGE, reasoning: "Auto-sélection: complexité élevée détectée" };
  } else if (hasLowIndicator && !hasHighIndicator) {
    return { model: MODELS.MISTRAL_SMALL, reasoning: "Auto-sélection: tâche simple détectée" };
  }

  return { model: MODELS.MISTRAL_MEDIUM, reasoning: "Auto-sélection: complexité moyenne" };
}

function selectGrokModel(complexity: AIComplexity, query: string): { model: string; reasoning: string } {
  if (complexity === "low") {
    return { model: MODELS.GROK_NON_REASONING, reasoning: "Grok non-reasoning (complexité basse)" };
  }
  if (complexity === "high" || complexity === "medium") {
    return { model: MODELS.GROK_REASONING, reasoning: `Grok reasoning (complexité ${complexity})` };
  }

  // Auto-détection
  const queryLower = query.toLowerCase();
  const lowComplexityIndicators = [
    "format", "convert", "simple", "quick", "list", "generate data",
    "json", "example", "template", "summarize"
  ];

  const hasLowIndicator = lowComplexityIndicators.some(i => queryLower.includes(i));
  if (hasLowIndicator) {
    return { model: MODELS.GROK_NON_REASONING, reasoning: "Auto-sélection: tâche simple → non-reasoning" };
  }

  return { model: MODELS.GROK_REASONING, reasoning: "Auto-sélection: reasoning par défaut" };
}

// ============================================================================
// CONVERSATION STORE (SQLite-based)
// ============================================================================

class ConversationStore {
  private db: Database.Database;
  private maxConversations = 50;
  private maxMessagesPerConversation = 50;

  constructor() {
    this.db = getDatabase();
  }

  private cleanupOldConversations(): void {
    try {
      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM consultant_conversations').get() as { count: number };

      if (countResult.count > this.maxConversations) {
        const toDelete = countResult.count - this.maxConversations;
        this.db.prepare(`
          DELETE FROM consultant_conversations
          WHERE id IN (
            SELECT id FROM consultant_conversations
            ORDER BY updated_at ASC
            LIMIT ?
          )
        `).run(toDelete);
      }
    } catch (e) {
      console.warn('[AIConsultant] Error cleaning up old conversations:', e);
    }
  }

  create(model: AIModel, metadata?: Record<string, unknown>): Conversation {
    this.cleanupOldConversations();

    const conversation: Conversation = {
      id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model,
      metadata,
    };

    this.db.prepare(`
      INSERT INTO consultant_conversations (id, model, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      conversation.id,
      conversation.model,
      metadata ? JSON.stringify(metadata) : null,
      conversation.createdAt,
      conversation.updatedAt
    );

    return conversation;
  }

  load(id: string): Conversation | null {
    try {
      const convRow = this.db.prepare(`
        SELECT id, model, metadata, created_at, updated_at
        FROM consultant_conversations WHERE id = ?
      `).get(id) as { id: string; model: string; metadata: string | null; created_at: number; updated_at: number } | undefined;

      if (!convRow) return null;

      const messages = this.db.prepare(`
        SELECT role, content, model, timestamp
        FROM consultant_messages
        WHERE conversation_id = ?
        ORDER BY timestamp ASC
      `).all(id) as ConversationMessage[];

      return {
        id: convRow.id,
        model: convRow.model as AIModel,
        metadata: convRow.metadata ? JSON.parse(convRow.metadata) : undefined,
        createdAt: convRow.created_at,
        updatedAt: convRow.updated_at,
        messages,
      };
    } catch (e) {
      console.warn(`[AIConsultant] Error loading conversation ${id}:`, e);
      return null;
    }
  }

  save(conversation: Conversation): void {
    try {
      if (conversation.messages.length > this.maxMessagesPerConversation) {
        conversation.messages = conversation.messages.slice(-this.maxMessagesPerConversation);
      }

      conversation.updatedAt = Date.now();

      this.db.prepare(`
        UPDATE consultant_conversations
        SET updated_at = ?, metadata = ?
        WHERE id = ?
      `).run(conversation.updatedAt, conversation.metadata ? JSON.stringify(conversation.metadata) : null, conversation.id);

      this.db.prepare('DELETE FROM consultant_messages WHERE conversation_id = ?').run(conversation.id);

      const insertStmt = this.db.prepare(`
        INSERT INTO consultant_messages (conversation_id, role, content, model, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const msg of conversation.messages) {
        insertStmt.run(conversation.id, msg.role, msg.content, msg.model || null, msg.timestamp);
      }
    } catch (e) {
      console.warn(`[AIConsultant] Error saving conversation ${conversation.id}:`, e);
    }
  }

  addMessage(conversationId: string, message: Omit<ConversationMessage, 'timestamp'>): void {
    try {
      const timestamp = Date.now();

      this.db.prepare(`
        INSERT INTO consultant_messages (conversation_id, role, content, model, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(conversationId, message.role, message.content, message.model || null, timestamp);

      this.db.prepare('UPDATE consultant_conversations SET updated_at = ? WHERE id = ?').run(timestamp, conversationId);

      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM consultant_messages WHERE conversation_id = ?').get(conversationId) as { count: number };

      if (countResult.count > this.maxMessagesPerConversation) {
        const toDelete = countResult.count - this.maxMessagesPerConversation;
        this.db.prepare(`
          DELETE FROM consultant_messages
          WHERE id IN (
            SELECT id FROM consultant_messages
            WHERE conversation_id = ?
            ORDER BY timestamp ASC
            LIMIT ?
          )
        `).run(conversationId, toDelete);
      }
    } catch (e) {
      console.warn(`[AIConsultant] Error adding message to ${conversationId}:`, e);
    }
  }

  delete(id: string): boolean {
    try {
      const result = this.db.prepare('DELETE FROM consultant_conversations WHERE id = ?').run(id);
      return result.changes > 0;
    } catch (e) {
      console.warn(`[AIConsultant] Error deleting conversation ${id}:`, e);
      return false;
    }
  }

  list(): Conversation[] {
    try {
      const convRows = this.db.prepare(`
        SELECT id FROM consultant_conversations ORDER BY updated_at DESC
      `).all() as { id: string }[];

      return convRows
        .map(row => this.load(row.id))
        .filter((c): c is Conversation => c !== null);
    } catch (e) {
      console.warn('[AIConsultant] Error listing conversations:', e);
      return [];
    }
  }

  clear(): void {
    try {
      this.db.prepare('DELETE FROM consultant_conversations').run();
    } catch (e) {
      console.warn('[AIConsultant] Error clearing conversations:', e);
    }
  }
}

// ============================================================================
// AI CONSULTANT PRINCIPAL
// ============================================================================

const DEFAULT_SYSTEM_PROMPT = `Tu es un assistant consulté par DangerousBot, une IA autonome et évolutive.
DangerousBot te consulte pour obtenir un second avis, brainstormer, ou déléguer certaines tâches.
Sois concis, direct et utile.`;

export class AIConsultant {
  private mistralApiKey: string;
  private grokApiKey: string;
  private conversationStore: ConversationStore;

  constructor(mistralKey?: string, grokKey?: string) {
    this.mistralApiKey = mistralKey || APIS.MISTRAL_API_KEY;
    this.grokApiKey = grokKey || APIS.GROK_API_KEY;
    this.conversationStore = new ConversationStore();
  }

  /**
   * Vérifie si un modèle est disponible
   */
  isAvailable(model: AIModel): boolean {
    if (model === 'mistral') return !!this.mistralApiKey;
    if (model === 'grok') return !!this.grokApiKey;
    return false;
  }

  /**
   * Liste les modèles disponibles
   */
  getAvailableModels(): AIModel[] {
    const models: AIModel[] = [];
    if (this.mistralApiKey) models.push('mistral');
    if (this.grokApiKey) models.push('grok');
    return models;
  }

  /**
   * Crée un provider via le système core
   */
  private createProviderForConsult(model: AIModel, modelString: string): CoreAIProvider {
    const apiKey = model === 'grok' ? this.grokApiKey : this.mistralApiKey;
    return createProvider({
      provider: model,
      apiKey,
      model: modelString,
      maxTokens: TOKENS.MAX_CONSULT_AI_RESPONSE
    });
  }

  /**
   * Consulte un modèle IA avec support multi-turn
   */
  async consult(request: ConsultRequest): Promise<ConsultResponse> {
    const { model = "mistral", conversationId, query, context, complexity = "auto", forceModelSize, systemPrompt } = request;

    if (!this.isAvailable(model)) {
      throw new Error(`Modèle '${model}' non disponible. Modèles disponibles: ${this.getAvailableModels().join(', ')}`);
    }

    // Sélection du modèle selon la complexité
    const { model: modelString, reasoning } = model === 'grok'
      ? selectGrokModel(complexity, query)
      : selectMistralModel(complexity, query, forceModelSize);

    // Gestion de la conversation
    let conversation: Conversation | null = null;
    let history: ConversationMessage[] | undefined;

    if (conversationId) {
      conversation = this.conversationStore.load(conversationId);
      if (conversation) {
        history = conversation.messages;
      }
    }

    if (!conversation) {
      conversation = this.conversationStore.create(model, {
        initialQuery: query.substring(0, 100)
      });
    }

    // Ajouter le message utilisateur à l'historique
    this.conversationStore.addMessage(conversation.id, {
      role: "user",
      content: query,
    });

    // Créer le provider via le système core
    const provider = this.createProviderForConsult(model, modelString);

    // Construire les messages au format AIMessage
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Historique
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role !== "system") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Message utilisateur
    const userContent = context
      ? `Contexte:\n${context}\n\n---\n\nQuestion/Tâche:\n${query}`
      : query;
    messages.push({ role: "user", content: userContent });

    // Appel via le core provider
    const response = await provider.chat(messages, {
      system: systemPrompt || DEFAULT_SYSTEM_PROMPT,
      tools: [],
      maxTokens: TOKENS.MAX_CONSULT_AI_RESPONSE
    });

    // Extraire le texte de la réponse
    const responseText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('');

    // Ajouter la réponse à l'historique
    this.conversationStore.addMessage(conversation.id, {
      role: "assistant",
      content: responseText,
      model,
    });

    return {
      response: responseText,
      model,
      modelSize: modelString,
      reasoning,
      conversationId: conversation.id,
      usage: response.usage || { input_tokens: 0, output_tokens: 0 },
    };
  }

  /**
   * Récupère une conversation par son ID
   */
  getConversation(id: string): Conversation | null {
    return this.conversationStore.load(id);
  }

  /**
   * Liste toutes les conversations
   */
  listConversations(): Conversation[] {
    return this.conversationStore.list();
  }

  /**
   * Supprime une conversation
   */
  deleteConversation(id: string): boolean {
    return this.conversationStore.delete(id);
  }

  /**
   * Efface toutes les conversations
   */
  clearConversations(): void {
    this.conversationStore.clear();
  }

  /**
   * Raccourcis pour des cas d'usage courants
   */

  async reviewCode(
    code: string,
    language: string,
    options?: {
      focus?: string;
      model?: AIModel;
      conversationId?: string;
    }
  ): Promise<ConsultResponse> {
    return this.consult({
      query: `Review ce code ${language}${options?.focus ? ` avec un focus sur: ${options.focus}` : ""}:\n\n\`\`\`${language}\n${code}\n\`\`\``,
      complexity: "high",
      model: options?.model,
      conversationId: options?.conversationId,
    });
  }

  async brainstorm(
    topic: string,
    options?: {
      constraints?: string;
      model?: AIModel;
      conversationId?: string;
    }
  ): Promise<ConsultResponse> {
    return this.consult({
      query: `Brainstorme sur: ${topic}${options?.constraints ? `\n\nContraintes: ${options.constraints}` : ""}`,
      complexity: "medium",
      model: options?.model,
      conversationId: options?.conversationId,
    });
  }

  async quickTask(
    task: string,
    options?: {
      model?: AIModel;
      conversationId?: string;
    }
  ): Promise<ConsultResponse> {
    return this.consult({
      query: task,
      complexity: "low",
      model: options?.model,
      conversationId: options?.conversationId,
    });
  }

  async validate(
    idea: string,
    options?: {
      context?: string;
      model?: AIModel;
      conversationId?: string;
    }
  ): Promise<ConsultResponse> {
    return this.consult({
      query: `Valide cette idée/approche et donne ton avis critique:\n\n${idea}`,
      context: options?.context,
      complexity: "medium",
      model: options?.model,
      conversationId: options?.conversationId,
    });
  }
}

// ============================================================================
// EXPORT
// ============================================================================

// Singleton
let aiConsultantInstance: AIConsultant | null = null;

export function getAIConsultant(): AIConsultant {
  if (!aiConsultantInstance) {
    aiConsultantInstance = new AIConsultant();
  }
  return aiConsultantInstance;
}

export function initAIConsultant(mistralKey?: string, grokKey?: string): AIConsultant {
  aiConsultantInstance = new AIConsultant(mistralKey, grokKey);
  return aiConsultantInstance;
}
