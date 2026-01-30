/**
 * Types pour l'abstraction des providers AI
 */

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string | AIContentBlock[];
}

export interface AIImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface AITextContent {
  type: 'text';
  text: string;
}

export interface AIToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface AIToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export type AIContentBlock = AITextContent | AIToolUseContent | AIToolResultContent | AIImageContent;

export interface AIToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AIResponse {
  content: AIContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  /** Coût estimé en USD (calculé par le provider) */
  cost?: {
    input_cost: number;
    output_cost: number;
    total_cost: number;
  };
}

export interface AIProviderConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

/**
 * Interface abstraite pour les providers AI
 */
export interface AIProvider {
  /** Nom du provider */
  readonly name: string;
  
  /** Modèle utilisé */
  readonly model: string;
  
  /**
   * Envoie un message et reçoit une réponse
   */
  chat(
    messages: AIMessage[],
    options: {
      system?: string;
      tools?: AIToolDefinition[];
      maxTokens?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<AIResponse>;
  
  /**
   * Vérifie si le provider supporte les tools
   */
  supportsTools(): boolean;
}
