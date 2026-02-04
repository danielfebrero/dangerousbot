/**
 * SwarmManager - Dispatch de tâches à des agents IA indépendants
 *
 * Permet de créer des "swarms" d'agents autonomes qui travaillent en arrière-plan.
 * Chaque agent a sa propre instance provider, son historique de conversation,
 * et peut utiliser les tools dans une boucle autonome.
 */

import { createProvider, ProviderType } from './providers/index.js';
import type { AIProvider, AIMessage, AIContentBlock, AIToolDefinition, AIResponse } from './providers/types.js';
import { executeTool, registerAllTools, getToolDefinitions } from './tools/index.js';
import type { ToolContext } from './tools/types.js';
import { Executor } from './executor.js';
import { Versioning } from './versioning.js';
import { Lifecycle } from './lifecycle.js';
import { getAIConsultant } from './ai-consultant.js';
import { getRollbackManager } from './rollback.js';
import { getMemory } from './memory.js';
import { configService } from './services/config.js';
import { MODELS, APIS, TOKENS } from '../config.js';
import { logger } from './logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type SwarmAgentStatus = 'pending' | 'running' | 'completed' | 'error';

export interface SwarmAgentInfo {
  agent_id: string;
  status: SwarmAgentStatus;
  query: string;
  result?: string;
  error?: string;
  tool_calls_count: number;
  iterations: number;
  created_at: number;
  completed_at?: number;
}

export interface SwarmInfo {
  swarm_id: string;
  agents: SwarmAgentInfo[];
  created_at: number;
}

interface ToolCallRecord {
  name: string;
  input: unknown;
  result: unknown;
}

// Safe subset of tools for swarm agents
const SWARM_ALLOWED_TOOLS = new Set([
  'read_file', 'write_file', 'edit_file', 'list_files', 'delete_file',
  'execute_code', 'shell',
  'searxng_search', 'retrieve_code', 'code_index',
  'remember', 'recall',
  'wait',
]);

const DEFAULT_SYSTEM_PROMPT = `Tu es un agent autonome de DangerousBot, dispatché pour accomplir une tâche spécifique.
Tu as accès à des outils pour lire/écrire des fichiers, exécuter du code, et chercher dans la codebase.
Sois méthodique, thorough, et rapporte tous les détails demandés.
Termine ta réponse par un résumé clair de tes findings.`;

const DEFAULT_MAX_ITERATIONS = 25;
const DEFAULT_MAX_AGENTS = 10;
const DEFAULT_MAX_RESPONSE_TOKENS = 16384;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const SWARM_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

// ============================================================================
// SWARM AGENT
// ============================================================================

class SwarmAgent {
  readonly id: string;
  private provider: AIProvider;
  private messages: AIMessage[] = [];
  private tools: AIToolDefinition[];
  private toolContext: ToolContext;
  private abortController: AbortController;
  private systemPrompt: string;
  private maxIterations: number;
  private maxTokens: number;

  status: SwarmAgentStatus = 'pending';
  query: string;
  result?: string;
  error?: string;
  toolCalls: ToolCallRecord[] = [];
  iterations: number = 0;
  createdAt: number = Date.now();
  completedAt?: number;

  constructor(
    id: string,
    query: string,
    provider: AIProvider,
    tools: AIToolDefinition[],
    toolContext: ToolContext,
    maxIterations: number,
    maxTokens: number,
    systemPrompt?: string,
  ) {
    this.id = id;
    this.query = query;
    this.provider = provider;
    this.tools = tools;
    this.toolContext = toolContext;
    this.abortController = new AbortController();
    this.systemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    this.maxIterations = maxIterations;
    this.maxTokens = maxTokens;
  }

  /**
   * Execute the agent's task with a full tool-loop
   */
  async run(): Promise<void> {
    this.status = 'running';
    logger.info('Swarm', `Agent ${this.id} started: ${this.query.substring(0, 80)}...`);

    try {
      // Add user message
      this.messages.push({
        role: 'user',
        content: this.query,
      });

      // Initial API call
      let response = await this.provider.chat(this.messages, {
        system: this.systemPrompt,
        tools: this.tools,
        maxTokens: this.maxTokens,
        abortSignal: this.abortController.signal,
      });

      // Add assistant response to history
      this.messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Tool-loop
      while (response.stopReason === 'tool_use' && this.iterations < this.maxIterations) {
        this.iterations++;

        if (this.abortController.signal.aborted) {
          throw new Error('Agent cancelled');
        }

        // Extract and execute tool calls
        const toolResults = await this.executeToolCalls(response.content);

        // Add tool results as user message (provider format)
        this.messages.push({
          role: 'user',
          content: toolResults,
        });

        // Continue conversation
        response = await this.provider.chat(this.messages, {
          system: this.systemPrompt,
          tools: this.tools,
          maxTokens: this.maxTokens,
          abortSignal: this.abortController.signal,
        });

        // Add assistant response to history
        this.messages.push({
          role: 'assistant',
          content: response.content,
        });
      }

      // Extract final text
      this.result = this.extractText(response.content);

      if (this.iterations >= this.maxIterations) {
        this.result += `\n\n[Agent stopped: max iterations (${this.maxIterations}) reached]`;
      }

      this.status = 'completed';
      this.completedAt = Date.now();
      logger.info('Swarm', `Agent ${this.id} completed (${this.iterations} iterations, ${this.toolCalls.length} tool calls)`);

    } catch (err) {
      this.status = 'error';
      this.error = (err as Error).message;
      this.completedAt = Date.now();
      logger.error('Swarm', `Agent ${this.id} failed: ${this.error}`);
    }
  }

  /**
   * Continue the agent with a new query (preserving history)
   */
  async continueWith(query: string): Promise<void> {
    this.query = query;
    this.status = 'running';
    this.result = undefined;
    this.error = undefined;
    this.abortController = new AbortController();

    logger.info('Swarm', `Agent ${this.id} continuing: ${query.substring(0, 80)}...`);

    try {
      // Add new user message to existing history
      this.messages.push({
        role: 'user',
        content: query,
      });

      // API call with full history
      let response = await this.provider.chat(this.messages, {
        system: this.systemPrompt,
        tools: this.tools,
        maxTokens: this.maxTokens,
        abortSignal: this.abortController.signal,
      });

      this.messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Tool-loop
      let continueIterations = 0;
      while (response.stopReason === 'tool_use' && continueIterations < this.maxIterations) {
        this.iterations++;
        continueIterations++;

        if (this.abortController.signal.aborted) {
          throw new Error('Agent cancelled');
        }

        const toolResults = await this.executeToolCalls(response.content);
        this.messages.push({ role: 'user', content: toolResults });

        response = await this.provider.chat(this.messages, {
          system: this.systemPrompt,
          tools: this.tools,
          maxTokens: this.maxTokens,
          abortSignal: this.abortController.signal,
        });

        this.messages.push({ role: 'assistant', content: response.content });
      }

      this.result = this.extractText(response.content);

      if (continueIterations >= this.maxIterations) {
        this.result += `\n\n[Agent stopped: max iterations (${this.maxIterations}) reached]`;
      }

      this.status = 'completed';
      this.completedAt = Date.now();
      logger.info('Swarm', `Agent ${this.id} continue completed (${continueIterations} new iterations)`);

    } catch (err) {
      this.status = 'error';
      this.error = (err as Error).message;
      this.completedAt = Date.now();
      logger.error('Swarm', `Agent ${this.id} continue failed: ${this.error}`);
    }
  }

  /**
   * Cancel the agent
   */
  cancel(): void {
    this.abortController.abort();
  }

  /**
   * Get agent info
   */
  getInfo(): SwarmAgentInfo {
    return {
      agent_id: this.id,
      status: this.status,
      query: this.query,
      result: this.result,
      error: this.error,
      tool_calls_count: this.toolCalls.length,
      iterations: this.iterations,
      created_at: this.createdAt,
      completed_at: this.completedAt,
    };
  }

  // --- Private helpers ---

  private async executeToolCalls(content: AIContentBlock[]): Promise<AIContentBlock[]> {
    const results: AIContentBlock[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        const toolName = block.name;
        const toolInput = block.input as Record<string, unknown>;

        logger.debug('Swarm', `Agent ${this.id} executing tool: ${toolName}`);

        let result: any;
        try {
          result = await executeTool(toolName, toolInput, this.toolContext);
        } catch (err) {
          result = { success: false, error: (err as Error).message };
        }

        this.toolCalls.push({ name: toolName, input: toolInput, result });

        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
    }

    return results;
  }

  private extractText(content: AIContentBlock[]): string {
    return content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');
  }
}

// ============================================================================
// SWARM
// ============================================================================

interface Swarm {
  id: string;
  agents: Map<string, SwarmAgent>;
  createdAt: number;
}

// ============================================================================
// SWARM MANAGER (Singleton)
// ============================================================================

export class SwarmManager {
  private static instance: SwarmManager;
  private swarms: Map<string, Swarm> = new Map();
  private agentIndex: Map<string, string> = new Map(); // agent_id → swarm_id
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private executor: Executor;
  private versioning: Versioning;
  private lifecycle: Lifecycle;

  private constructor() {
    this.executor = new Executor(process.cwd());
    this.versioning = new Versioning(process.cwd());
    this.lifecycle = new Lifecycle(process.cwd());

    // Ensure tool registry is initialized
    registerAllTools();

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  static getInstance(): SwarmManager {
    if (!SwarmManager.instance) {
      SwarmManager.instance = new SwarmManager();
    }
    return SwarmManager.instance;
  }

  /**
   * Create a swarm with multiple agents
   */
  async createSwarm(queries: string[]): Promise<SwarmInfo> {
    const totalAgents = this.getTotalAgentCount();
    const maxAgents = await this.getMaxAgents();

    if (totalAgents + queries.length > maxAgents) {
      throw new Error(`Limite d'agents atteinte. Actifs: ${totalAgents}, demandés: ${queries.length}, max: ${maxAgents}`);
    }

    const swarmId = `swarm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const swarm: Swarm = {
      id: swarmId,
      agents: new Map(),
      createdAt: Date.now(),
    };

    this.swarms.set(swarmId, swarm);

    // Create and start all agents
    const agentInfos: SwarmAgentInfo[] = [];
    for (const query of queries) {
      const agent = await this.createAgent(swarm, query);
      agentInfos.push(agent.getInfo());
      // Start agent in background (fire-and-forget)
      agent.run();
    }

    return {
      swarm_id: swarmId,
      agents: agentInfos,
      created_at: swarm.createdAt,
    };
  }

  /**
   * Add an agent to an existing swarm
   */
  async addAgent(swarmId: string, query: string): Promise<SwarmAgentInfo> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm '${swarmId}' introuvable`);
    }

    const totalAgents = this.getTotalAgentCount();
    const maxAgents = await this.getMaxAgents();
    if (totalAgents >= maxAgents) {
      throw new Error(`Limite d'agents atteinte (${maxAgents}). Attendez que des agents terminent.`);
    }

    const agent = await this.createAgent(swarm, query);
    agent.run();

    return agent.getInfo();
  }

  /**
   * Retrieve status and result of an agent
   */
  getAgentInfo(agentId: string): SwarmAgentInfo | null {
    const swarmId = this.agentIndex.get(agentId);
    if (!swarmId) return null;

    const swarm = this.swarms.get(swarmId);
    if (!swarm) return null;

    const agent = swarm.agents.get(agentId);
    if (!agent) return null;

    return agent.getInfo();
  }

  /**
   * Continue an agent with a new query
   */
  async continueAgent(agentId: string, query: string): Promise<SwarmAgentInfo> {
    const swarmId = this.agentIndex.get(agentId);
    if (!swarmId) throw new Error(`Agent '${agentId}' introuvable`);

    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm pour agent '${agentId}' introuvable`);

    const agent = swarm.agents.get(agentId);
    if (!agent) throw new Error(`Agent '${agentId}' introuvable dans le swarm`);

    if (agent.status === 'running') {
      throw new Error(`Agent '${agentId}' est encore en cours d'exécution`);
    }

    // Start continuation in background
    agent.continueWith(query);

    return agent.getInfo();
  }

  /**
   * Get info about a swarm
   */
  getSwarmInfo(swarmId: string): SwarmInfo | null {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return null;

    return {
      swarm_id: swarm.id,
      agents: Array.from(swarm.agents.values()).map(a => a.getInfo()),
      created_at: swarm.createdAt,
    };
  }

  // --- Private helpers ---

  private async createAgent(swarm: Swarm, query: string): Promise<SwarmAgent> {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { provider: providerType, model } = await this.resolveModel();
    const apiKey = this.getApiKey(providerType);

    if (!apiKey) {
      throw new Error(`Clé API non disponible pour le provider '${providerType}'`);
    }

    const maxIterations = await this.getMaxIterations();

    const provider = createProvider({
      provider: providerType,
      apiKey,
      model,
      maxTokens: DEFAULT_MAX_RESPONSE_TOKENS,
    });

    // Get safe tool definitions
    const allTools = getToolDefinitions();
    const safeTools = allTools.filter(t => SWARM_ALLOWED_TOOLS.has(t.name));

    // Build tool context
    const memory = getMemory();
    let aiConsultant = null;
    try { aiConsultant = getAIConsultant(); } catch { /* not available */ }
    let rollbackManager = null;
    try { rollbackManager = getRollbackManager(); } catch { /* not available */ }

    const toolContext: ToolContext = {
      projectRoot: process.cwd(),
      executor: this.executor,
      memory,
      versioning: this.versioning,
      lifecycle: this.lifecycle,
      mistral: null,
      aiConsultant,
      rollbackManager,
      threadId: `swarm-${agentId}`,
      source: 'webapp',
    };

    const agent = new SwarmAgent(
      agentId,
      query,
      provider,
      safeTools,
      toolContext,
      maxIterations,
      DEFAULT_MAX_RESPONSE_TOKENS,
    );

    swarm.agents.set(agentId, agent);
    this.agentIndex.set(agentId, swarm.id);

    return agent;
  }

  private async resolveModel(): Promise<{ provider: ProviderType; model: string }> {
    const configValue = await configService.get('swarm.model');

    if (!configValue) {
      return { provider: 'mistral', model: MODELS.MISTRAL_LARGE };
    }

    // Support format "provider:model" or just "provider"
    if (configValue.includes(':')) {
      const [providerStr, modelStr] = configValue.split(':', 2);
      return {
        provider: providerStr as ProviderType,
        model: modelStr,
      };
    }

    // Just provider name - use default model
    const defaultModels: Record<string, string> = {
      mistral: MODELS.MISTRAL_LARGE,
      claude: 'claude-opus-4-5-20251101',
      kimi: 'kimi-k2.5',
      grok: 'grok-4-1-fast-reasoning',
    };

    const provider = configValue as ProviderType;
    return {
      provider,
      model: defaultModels[provider] || MODELS.MISTRAL_LARGE,
    };
  }

  private getApiKey(provider: ProviderType): string {
    switch (provider) {
      case 'mistral': return APIS.MISTRAL_API_KEY;
      case 'claude': {
        try {
          const fs = require('fs');
          const { PATHS } = require('../config.js');
          return process.env.ANTHROPIC_API_KEY || (fs.existsSync(PATHS.ANTHROPIC_KEY_FILE) ? fs.readFileSync(PATHS.ANTHROPIC_KEY_FILE, 'utf-8').trim() : '');
        } catch {
          return process.env.ANTHROPIC_API_KEY || '';
        }
      }
      case 'kimi': return APIS.KIMI_API_KEY;
      case 'grok': return APIS.GROK_API_KEY;
      default: return '';
    }
  }

  private async getMaxIterations(): Promise<number> {
    const value = await configService.get('swarm.max_iterations');
    if (value) {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_MAX_ITERATIONS;
  }

  private async getMaxAgents(): Promise<number> {
    const value = await configService.get('swarm.max_agents');
    if (value) {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_MAX_AGENTS;
  }

  private getTotalAgentCount(): number {
    let count = 0;
    for (const swarm of this.swarms.values()) {
      for (const agent of swarm.agents.values()) {
        if (agent.status === 'running' || agent.status === 'pending') {
          count++;
        }
      }
    }
    return count;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [swarmId, swarm] of this.swarms) {
      if (now - swarm.createdAt > SWARM_MAX_AGE_MS) {
        // Cancel any running agents
        for (const agent of swarm.agents.values()) {
          if (agent.status === 'running' || agent.status === 'pending') {
            agent.cancel();
          }
          this.agentIndex.delete(agent.id);
        }
        this.swarms.delete(swarmId);
        logger.debug('Swarm', `Cleaned up old swarm ${swarmId}`);
      }
    }
  }

  /**
   * Shutdown - cancel all agents and stop cleanup timer
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    for (const swarm of this.swarms.values()) {
      for (const agent of swarm.agents.values()) {
        agent.cancel();
      }
    }
    this.swarms.clear();
    this.agentIndex.clear();
  }
}

// Singleton accessor
export function getSwarmManager(): SwarmManager {
  return SwarmManager.getInstance();
}
