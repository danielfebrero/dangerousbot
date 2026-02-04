/**
 * SwarmManager - Exécution parallèle de queries IA indépendantes
 *
 * Dispatch N queries à N agents parallèles, attend que tous terminent,
 * retourne tous les résultats. Chaque agent a son propre provider et tool-loop.
 */

import { createProvider, ProviderType } from './providers/index.js';
import type { AIProvider, AIMessage, AIContentBlock, AIToolDefinition } from './providers/types.js';
import { executeTool, registerAllTools, getToolDefinitions } from './tools/index.js';
import type { ToolContext } from './tools/types.js';
import { Executor } from './executor.js';
import { Versioning } from './versioning.js';
import { Lifecycle } from './lifecycle.js';
import { getAIConsultant } from './ai-consultant.js';
import { getRollbackManager } from './rollback.js';
import { getMemory } from './memory.js';
import { configService } from './services/config.js';
import { MODELS, APIS } from '../config.js';
import { logger } from './logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SwarmAgentResult {
  query: string;
  success: boolean;
  result?: string;
  error?: string;
  tool_calls_count: number;
  iterations: number;
}

export interface SwarmResult {
  success: boolean;
  results: SwarmAgentResult[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

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
const DEFAULT_MAX_RESPONSE_TOKENS = 16384;

// ============================================================================
// SINGLE AGENT EXECUTION
// ============================================================================

async function runAgent(
  query: string,
  provider: AIProvider,
  tools: AIToolDefinition[],
  toolContext: ToolContext,
  maxIterations: number,
): Promise<SwarmAgentResult> {
  const messages: AIMessage[] = [];
  let toolCallsCount = 0;
  let iterations = 0;

  try {
    messages.push({ role: 'user', content: query });

    let response = await provider.chat(messages, {
      system: DEFAULT_SYSTEM_PROMPT,
      tools,
      maxTokens: DEFAULT_MAX_RESPONSE_TOKENS,
    });

    messages.push({ role: 'assistant', content: response.content });

    while (response.stopReason === 'tool_use' && iterations < maxIterations) {
      iterations++;

      // Execute tool calls
      const toolResults: AIContentBlock[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          toolCallsCount++;
          let result: any;
          try {
            result = await executeTool(block.name, block.input as Record<string, unknown>, toolContext);
          } catch (err) {
            result = { success: false, error: (err as Error).message };
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });

      response = await provider.chat(messages, {
        system: DEFAULT_SYSTEM_PROMPT,
        tools,
        maxTokens: DEFAULT_MAX_RESPONSE_TOKENS,
      });

      messages.push({ role: 'assistant', content: response.content });
    }

    // Extract final text
    let text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    if (iterations >= maxIterations) {
      text += `\n\n[Agent stopped: max iterations (${maxIterations}) reached]`;
    }

    return { query, success: true, result: text, tool_calls_count: toolCallsCount, iterations };
  } catch (err) {
    return { query, success: false, error: (err as Error).message, tool_calls_count: toolCallsCount, iterations };
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Execute multiple queries in parallel, wait for all to complete, return results.
 */
export async function executeSwarm(queries: string[]): Promise<SwarmResult> {
  registerAllTools();

  const { provider: providerType, model } = await resolveModel();
  const apiKey = getApiKey(providerType);

  if (!apiKey) {
    return {
      success: false,
      results: queries.map(q => ({
        query: q, success: false, error: `Clé API non disponible pour '${providerType}'`, tool_calls_count: 0, iterations: 0,
      })),
    };
  }

  const maxIterations = await getMaxIterations();

  // Get safe tool definitions
  const allTools = getToolDefinitions();
  const safeTools = allTools.filter(t => SWARM_ALLOWED_TOOLS.has(t.name));

  // Shared dependencies
  const executor = new Executor(process.cwd());
  const versioning = new Versioning(process.cwd());
  const lifecycle = new Lifecycle(process.cwd());
  const memory = getMemory();
  let aiConsultant = null;
  try { aiConsultant = getAIConsultant(); } catch { /* not available */ }
  let rollbackManager = null;
  try { rollbackManager = getRollbackManager(); } catch { /* not available */ }

  logger.info('Swarm', `Dispatching ${queries.length} agent(s) on ${providerType}/${model}`);

  // Launch all agents in parallel
  const promises = queries.map((query, i) => {
    // Each agent gets its own provider instance
    const provider = createProvider({ provider: providerType, apiKey, model });

    const toolContext: ToolContext = {
      projectRoot: process.cwd(),
      executor,
      memory,
      versioning,
      lifecycle,
      mistral: null,
      aiConsultant,
      rollbackManager,
      threadId: `swarm-${Date.now()}-${i}`,
      source: 'webapp',
    };

    return runAgent(query, provider, safeTools, toolContext, maxIterations);
  });

  const results = await Promise.all(promises);
  const allSuccess = results.every(r => r.success);

  logger.info('Swarm', `Swarm completed: ${results.filter(r => r.success).length}/${results.length} succeeded`);

  return { success: allSuccess, results };
}

// ============================================================================
// CONFIG HELPERS
// ============================================================================

async function resolveModel(): Promise<{ provider: ProviderType; model: string }> {
  const configValue = await configService.get('swarm.model');

  if (!configValue) {
    return { provider: 'mistral', model: MODELS.MISTRAL_LARGE };
  }

  if (configValue.includes(':')) {
    const [providerStr, modelStr] = configValue.split(':', 2);
    return { provider: providerStr as ProviderType, model: modelStr };
  }

  const defaultModels: Record<string, string> = {
    mistral: MODELS.MISTRAL_LARGE,
    claude: 'claude-opus-4-5-20251101',
    kimi: 'kimi-k2.5',
    grok: 'grok-4-1-fast-reasoning',
  };

  const provider = configValue as ProviderType;
  return { provider, model: defaultModels[provider] || MODELS.MISTRAL_LARGE };
}

function getApiKey(provider: ProviderType): string {
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

async function getMaxIterations(): Promise<number> {
  const value = await configService.get('swarm.max_iterations');
  if (value) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_ITERATIONS;
}
