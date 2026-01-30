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

  constructor(projectRoot: string) {
    this.executor = new Executor(projectRoot);
    this.versioning = new Versioning(projectRoot);
    this.lifecycle = new Lifecycle(projectRoot);
    
    try {
      this.mistral = new MistralConsultant();
    } catch (e) {
      console.warn('[Tools] Mistral not available:', (e as Error).message);
    }
    
    // Initialiser le registry
    registerAllTools();
  }

  async execute(toolName: string, input: any): Promise<any> {
    const memory = getMemory();
    const rollbackManager = getRollbackManager();
    
    const context: ToolContext = {
      projectRoot: process.cwd(),
      executor: this.executor,
      memory,
      versioning: this.versioning,
      lifecycle: this.lifecycle,
      mistral: this.mistral,
      rollbackManager
    };
    
    return await executeTool(toolName, input, context);
  }
}
