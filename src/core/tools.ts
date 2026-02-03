/**
 * Tools - Point d'entrée legacy (maintenu pour compatibilité)
 * 
 * DEPRECATED: Utilisez directement src/core/tools/index.ts
 * Ce fichier sera supprimé dans une future version.
 */

import {
  getToolDefinitions,
  getToolDefinitionsForProvider,
  executeTool,
  registerAllTools,
  ToolContext
} from './tools/index';

import { Executor } from './executor';
import { Versioning } from './versioning';
import { Lifecycle } from './lifecycle';
import { MistralConsultant } from './mistral';
import { AIConsultant, getAIConsultant } from './ai-consultant';
import { getRollbackManager } from './rollback';
import { getMemory } from './memory';

export { getToolDefinitions, getToolDefinitionsForProvider };

/**
 * ToolExecutor - Classe legacy qui délègue au nouveau système
 */
export class ToolExecutor {
  private executor: Executor;
  private versioning: Versioning;
  private lifecycle: Lifecycle;
  private mistral: MistralConsultant | null = null;
  private aiConsultant: AIConsultant | null = null;

  constructor(projectRoot: string) {
    this.executor = new Executor(projectRoot);
    this.versioning = new Versioning(projectRoot);
    this.lifecycle = new Lifecycle(projectRoot);

    try {
      this.mistral = new MistralConsultant();
    } catch (e) {
      console.warn('[Tools] Mistral not available:', (e as Error).message);
    }

    try {
      this.aiConsultant = getAIConsultant();
    } catch (e) {
      console.warn('[Tools] AI Consultant not available:', (e as Error).message);
    }

    // Initialiser le registry
    registerAllTools();
  }

  async execute(
    toolName: string,
    input: any,
    abortSignal?: AbortSignal,
    platformContext?: { telegramChatId?: string; bot?: any; threadId?: string }
  ): Promise<any> {
    const memory = getMemory();
    const rollbackManager = getRollbackManager();

    const context: ToolContext = {
      projectRoot: process.cwd(),
      executor: this.executor,
      memory,
      versioning: this.versioning,
      lifecycle: this.lifecycle,
      mistral: this.mistral,
      aiConsultant: this.aiConsultant,
      rollbackManager,
      telegramChatId: platformContext?.telegramChatId,
      bot: platformContext?.bot,
      abortSignal,
      threadId: platformContext?.threadId
    };

    return await executeTool(toolName, input, context);
  }
}
