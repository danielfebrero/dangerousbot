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
 */

import { config, TOKENS, MODELS, APIS, PATHS } from "../config.js";
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
// INTERFACES PROVIDERS
// ============================================================================

interface AIProvider {
  name: string;
  consult(request: ConsultRequest, history?: ConversationMessage[]): Promise<ConsultResponse>;
  isAvailable(): boolean;
}

// ============================================================================
// MISTRAL PROVIDER
// ============================================================================

interface MistralMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface MistralResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: MistralMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class MistralProvider implements AIProvider {
  name = "mistral";
  private baseUrl = "https://api.mistral.ai/v1";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  private selectModel(complexity: AIComplexity, query: string): string {
    if (complexity !== "auto") {
      const modelMap = {
        low: MODELS.MISTRAL_SMALL,
        medium: MODELS.MISTRAL_MEDIUM,
        high: MODELS.MISTRAL_LARGE,
      };
      return modelMap[complexity];
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
      return MODELS.MISTRAL_LARGE;
    } else if (hasLowIndicator && !hasHighIndicator) {
      return MODELS.MISTRAL_SMALL;
    }
    
    return MODELS.MISTRAL_MEDIUM;
  }

  async consult(request: ConsultRequest, history?: ConversationMessage[]): Promise<ConsultResponse> {
    const { query, context, complexity = "auto", forceModelSize, systemPrompt } = request;

    let model: string;
    let reasoning: string;

    if (forceModelSize) {
      const modelMap = {
        large: MODELS.MISTRAL_LARGE,
        medium: MODELS.MISTRAL_MEDIUM,
        small: MODELS.MISTRAL_SMALL,
      };
      model = modelMap[forceModelSize];
      reasoning = `Modèle forcé: ${forceModelSize}`;
    } else {
      model = this.selectModel(complexity, query);
      reasoning = complexity === "auto" 
        ? `Auto-sélection basée sur l'analyse de la requête`
        : `Complexité spécifiée: ${complexity}`;
    }

    const defaultSystemPrompt = `Tu es un assistant consulté par DangerousBot, une IA autonome basée sur Claude Opus 4.5.
DangerousBot te consulte pour obtenir un second avis, brainstormer, ou déléguer certaines tâches.
Sois concis, direct et utile. Tu n'es pas le cerveau principal, tu es un conseiller.`;

    // Construction des messages
    const messages: MistralMessage[] = [
      { role: "system", content: systemPrompt || defaultSystemPrompt }
    ];

    // Ajout de l'historique si présent
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role !== "system") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    const userContent = context 
      ? `Contexte:\n${context}\n\n---\n\nQuestion/Tâche:\n${query}`
      : query;

    messages.push({ role: "user", content: userContent });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: TOKENS.MAX_MISTRAL_RESPONSE,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as MistralResponse;

    return {
      response: data.choices[0].message.content,
      model: this.name,
      modelSize: model,
      reasoning,
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      },
    };
  }
}

// ============================================================================
// GROK PROVIDER
// ============================================================================

interface GrokMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface GrokResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: GrokMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class GrokProvider implements AIProvider {
  name = "grok";
  private baseUrl = "https://api.x.ai/v1";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  private selectModel(complexity: AIComplexity, query: string): string {
    if (complexity === "low") {
      return MODELS.GROK_4_1_FAST_NON_REASONING;
    }
    // Pour high, medium, ou auto avec indicateurs de complexité
    if (complexity === "high" || complexity === "medium") {
      return MODELS.GROK_4_1_FAST_REASONING;
    }

    // Auto-détection
    const queryLower = query.toLowerCase();
    const lowComplexityIndicators = [
      "format", "convert", "simple", "quick", "list", "generate data",
      "json", "example", "template", "summarize"
    ];

    const hasLowIndicator = lowComplexityIndicators.some(i => queryLower.includes(i));
    if (hasLowIndicator) {
      return MODELS.GROK_4_1_FAST_NON_REASONING;
    }

    return MODELS.GROK_4_1_FAST_REASONING;
  }

  async consult(request: ConsultRequest, history?: ConversationMessage[]): Promise<ConsultResponse> {
    const { query, context, complexity = "auto", systemPrompt } = request;

    const model = this.selectModel(complexity, query);
    const reasoning = `Grok selected: ${model}`;

    const defaultSystemPrompt = `Tu es un assistant consulté par DangerousBot, une IA autonome basée sur Claude Opus 4.5.
DangerousBot te consulte pour obtenir un second avis, brainstormer, ou déléguer certaines tâches.
Sois concis, direct et utile. Tu n'es pas le cerveau principal, tu es un conseiller.`;

    // Construction des messages
    const messages: GrokMessage[] = [
      { role: "system", content: systemPrompt || defaultSystemPrompt }
    ];

    // Ajout de l'historique si présent
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role !== "system") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    const userContent = context 
      ? `Contexte:\n${context}\n\n---\n\nQuestion/Tâche:\n${query}`
      : query;

    messages.push({ role: "user", content: userContent });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: TOKENS.MAX_MISTRAL_RESPONSE,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as GrokResponse;

    return {
      response: data.choices[0].message.content,
      model: this.name,
      modelSize: model,
      reasoning,
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      },
    };
  }
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
      // Count conversations
      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM consultant_conversations').get() as { count: number };

      if (countResult.count > this.maxConversations) {
        // Delete oldest conversations beyond the limit
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
      // Limit messages
      if (conversation.messages.length > this.maxMessagesPerConversation) {
        conversation.messages = conversation.messages.slice(-this.maxMessagesPerConversation);
      }

      conversation.updatedAt = Date.now();

      // Update conversation metadata
      this.db.prepare(`
        UPDATE consultant_conversations
        SET updated_at = ?, metadata = ?
        WHERE id = ?
      `).run(conversation.updatedAt, conversation.metadata ? JSON.stringify(conversation.metadata) : null, conversation.id);

      // Delete existing messages and re-insert (simpler than tracking changes)
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

      // Update conversation updated_at
      this.db.prepare('UPDATE consultant_conversations SET updated_at = ? WHERE id = ?').run(timestamp, conversationId);

      // Limit messages per conversation
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

export class AIConsultant {
  private providers: Map<AIModel, AIProvider>;
  private conversationStore: ConversationStore;

  constructor(mistralKey?: string, grokKey?: string) {
    this.providers = new Map();
    this.conversationStore = new ConversationStore();

    // Initialiser les providers
    const mistralApiKey = mistralKey || APIS.MISTRAL_API_KEY;
    const grokApiKey = grokKey || APIS.GROK_API_KEY;

    if (mistralApiKey) {
      this.providers.set("mistral", new MistralProvider(mistralApiKey));
    }

    if (grokApiKey) {
      this.providers.set("grok", new GrokProvider(grokApiKey));
    }
  }

  /**
   * Vérifie si un modèle est disponible
   */
  isAvailable(model: AIModel): boolean {
    const provider = this.providers.get(model);
    return provider?.isAvailable() || false;
  }

  /**
   * Liste les modèles disponibles
   */
  getAvailableModels(): AIModel[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isAvailable())
      .map(([model, _]) => model);
  }

  /**
   * Consulte un modèle IA avec support multi-turn
   */
  async consult(request: ConsultRequest): Promise<ConsultResponse> {
    const { model = "mistral", conversationId } = request;

    const provider = this.providers.get(model);
    if (!provider) {
      throw new Error(`Modèle '${model}' non disponible. Modèles disponibles: ${this.getAvailableModels().join(', ')}`);
    }

    if (!provider.isAvailable()) {
      throw new Error(`Le modèle '${model}' n'est pas configuré (clé API manquante)`);
    }

    // Gestion de la conversation
    let conversation: Conversation | null = null;
    let history: ConversationMessage[] | undefined;

    if (conversationId) {
      conversation = this.conversationStore.load(conversationId);
      if (conversation) {
        history = conversation.messages;
      }
    }

    // Si pas de conversation existante, en créer une nouvelle
    if (!conversation) {
      conversation = this.conversationStore.create(model, { 
        initialQuery: request.query.substring(0, 100) 
      });
    }

    // Ajouter le message utilisateur à l'historique
    this.conversationStore.addMessage(conversation.id, {
      role: "user",
      content: request.query,
    });

    // Consulter le modèle
    const response = await provider.consult(request, history);

    // Ajouter la réponse à l'historique
    this.conversationStore.addMessage(conversation.id, {
      role: "assistant",
      content: response.response,
      model: response.model,
    });

    // Retourner avec l'ID de conversation
    return {
      ...response,
      conversationId: conversation.id,
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
