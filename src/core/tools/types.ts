/**
 * Types partagés pour les tools
 */

import { Tool as ToolType, ToolResult, ToolInput } from '../types';

export { ToolType as Tool };

export interface ToolHandler {
  name: string;
  definition: ToolType;
  execute(input: ToolInput, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  projectRoot: string;
  executor: any; // Executor
  memory: any; // Memory
  versioning: any; // Versioning
  lifecycle: any; // Lifecycle
  mistral: any; // MistralConsultant | null (legacy)
  aiConsultant: any; // AIConsultant | null
  rollbackManager: any; // RollbackManager | null
  telegramChatId?: string; // Chat ID pour Telegram
  bot?: any; // Instance TelegramBot
  abortSignal?: AbortSignal; // Signal d'annulation pour les tool calls longs
  threadId?: string; // Thread ID pour tracer le contexte d'exécution
}
