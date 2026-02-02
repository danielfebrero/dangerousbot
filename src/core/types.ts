/**
 * Types pour DangerousBot
 */

import Anthropic from '@anthropic-ai/sdk';

// ============ Messages & Conversation ============

export interface ToolCall {
  name: string;
  input: unknown;
}

export interface Message {
  id?: number;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  timestamp: string;
}

export interface Conversation {
  session_id: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

// ============ Memory / Embeddings ============

export interface Embedding {
  id?: number;
  conversation_id: number;
  vector: Buffer;
  metadata: Record<string, unknown>;
}

export interface Knowledge {
  id?: number;
  type: 'fact' | 'preference' | 'context' | 'skill';
  content: string;
  embedding?: Buffer;
  created_at: string;
}

// ============ Stats ============

export interface Stats {
  sessions: number;
  messages: number;
  knowledge: number;
  version?: string;
}

// ============ Brain / Claude API ============

export interface BrainResponse {
  content: Anthropic.ContentBlock[];
  stopReason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  cost?: {
    input_cost: number;
    output_cost: number;
    total_cost: number;
  };
}

// ============ Tools ============

export interface ToolProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: ToolProperty;
  minimum?: number;
  maximum?: number;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, ToolProperty>;
    required: string[];
  };
}

export interface ToolResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;  // Indique si le tool a été annulé par l'utilisateur
  [key: string]: unknown;
}

export interface ToolInput {
  [key: string]: unknown;
  abortSignal?: AbortSignal;  // Signal d'annulation pour les tool calls longs
}

// ============ Executor ============

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  logs?: Array<[string, ...unknown[]]>;
  error?: string;
  stack?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  [key: string]: unknown;
}

// ============ WebSocket ============

export interface WSMessage {
  type: 'user_message' | 'bot_message' | 'bot_typing' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'connected' | 'history' | 'usage' | 'stream_chunk' | 'provider_switch' | 'restart_signal' | 'thread_switched' | 'thread_created' | 'thread_renamed' | 'thread_deleted' | 'thread_cleared' | 'threads_list';
  payload: unknown;
  timestamp?: string;
  threadId?: string;  // Pour isolation des messages entre threads
}

// ============ Lifecycle ============

export interface LifecycleConfig {
  isDev: boolean;
  lockfilePath: string;
  projectRoot: string;
}

// ============ Versioning ============

export interface VersionInfo {
  version: string;
  commit?: string;
  timestamp: string;
  description?: string;
}

// ============ Server ============

export interface ServerConfig {
  port: number;
  host: string;
}
