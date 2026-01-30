/**
 * Types partagés pour les tools
 */

import { Tool, ToolResult, ToolInput } from '../types';

export interface ToolHandler {
  name: string;
  definition: Tool;
  execute(input: ToolInput, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  projectRoot: string;
  executor: any; // Executor
  memory: any; // Memory
  versioning: any; // Versioning
  lifecycle: any; // Lifecycle
  mistral: any; // MistralConsultant | null
  rollbackManager: any; // RollbackManager | null
}
