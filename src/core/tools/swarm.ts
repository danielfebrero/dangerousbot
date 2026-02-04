/**
 * Tool: swarm - Dispatch de tâches à des agents IA indépendants
 *
 * Permet de créer des swarms d'agents autonomes qui travaillent en arrière-plan.
 * Chaque agent a sa propre instance provider et peut utiliser les tools.
 *
 * Actions:
 * - create: Crée un swarm avec plusieurs agents
 * - add: Ajoute un agent à un swarm existant
 * - retrieve: Consulte le status/résultat d'un agent
 * - continue: Ajoute une query à un agent en conservant son historique
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { getSwarmManager } from '../swarm-manager';

export const swarmDefinition: Tool = {
  name: 'swarm',
  description: `Dispatch des tâches à des agents IA indépendants qui travaillent en arrière-plan avec leurs propres tool calls.

Actions:
- create: Crée un swarm d'agents parallèles. Chaque query lance un agent autonome.
- add: Ajoute un agent à un swarm existant.
- retrieve: Récupère le status et résultat d'un agent (pending, running, completed, error).
- continue: Relance un agent terminé avec une nouvelle query en conservant son historique.

Les agents ont accès aux tools: read_file, write_file, edit_file, list_files, delete_file, execute_code, shell, searxng_search, retrieve_code, code_index, remember, recall, wait.

Configuration via config():
- swarm.model: Provider et modèle (défaut: mistral). Format: "provider" ou "provider:model_id"
- swarm.max_iterations: Max itérations tool-loop par agent (défaut: 25)
- swarm.max_agents: Max agents concurrents (défaut: 10)

Workflow typique:
1. swarm(create, [query1, query2, ...]) → obtenir les agent_ids
2. Continuer à travailler / utiliser wait() si nécessaire
3. swarm(retrieve, agent_id) → vérifier le status
4. Optionnellement swarm(continue, agent_id, nouvelle_query) pour approfondir`,
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action à effectuer',
        enum: ['create', 'add', 'retrieve', 'continue'],
      },
      queries: {
        type: 'string',
        description: 'Liste de queries séparées par "|||" pour create. Chaque query crée un agent indépendant. Ex: "Lis src/foo.ts|||Analyse src/bar.ts"',
      },
      swarm_id: {
        type: 'string',
        description: 'ID du swarm (requis pour add)',
      },
      agent_id: {
        type: 'string',
        description: 'ID de l\'agent (requis pour retrieve et continue)',
      },
      query: {
        type: 'string',
        description: 'Query pour add ou continue',
      },
    },
    required: ['action'],
  },
};

export const swarmHandler: ToolHandler = {
  name: 'swarm',
  definition: swarmDefinition,

  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const action = input.action as string;
    const manager = getSwarmManager();

    try {
      switch (action) {
        case 'create': {
          const queriesStr = input.queries as string;
          if (!queriesStr) {
            return { success: false, error: 'Le paramètre "queries" est requis pour create. Séparer les queries par "|||".' };
          }

          const queries = queriesStr.split('|||').map(q => q.trim()).filter(q => q.length > 0);
          if (queries.length === 0) {
            return { success: false, error: 'Aucune query valide fournie.' };
          }

          const swarmInfo = await manager.createSwarm(queries);

          return {
            success: true,
            swarm_id: swarmInfo.swarm_id,
            agents: swarmInfo.agents.map(a => ({
              agent_id: a.agent_id,
              status: a.status,
              query_preview: a.query.substring(0, 100),
            })),
            message: `Swarm créé avec ${queries.length} agent(s). Utilisez swarm(retrieve, agent_id) pour consulter les résultats.`,
          };
        }

        case 'add': {
          const swarmId = input.swarm_id as string;
          const query = input.query as string;

          if (!swarmId) {
            return { success: false, error: 'Le paramètre "swarm_id" est requis pour add.' };
          }
          if (!query) {
            return { success: false, error: 'Le paramètre "query" est requis pour add.' };
          }

          const agentInfo = await manager.addAgent(swarmId, query);

          return {
            success: true,
            agent_id: agentInfo.agent_id,
            status: agentInfo.status,
            message: `Agent ajouté au swarm ${swarmId}.`,
          };
        }

        case 'retrieve': {
          const agentId = input.agent_id as string;
          if (!agentId) {
            return { success: false, error: 'Le paramètre "agent_id" est requis pour retrieve.' };
          }

          const info = manager.getAgentInfo(agentId);
          if (!info) {
            return { success: false, error: `Agent '${agentId}' introuvable.` };
          }

          return {
            success: true,
            agent_id: info.agent_id,
            status: info.status,
            result: info.result,
            error: info.error,
            tool_calls_count: info.tool_calls_count,
            iterations: info.iterations,
            created_at: new Date(info.created_at).toISOString(),
            completed_at: info.completed_at ? new Date(info.completed_at).toISOString() : undefined,
            message: info.status === 'completed'
              ? `Agent terminé (${info.iterations} itérations, ${info.tool_calls_count} tool calls).`
              : info.status === 'error'
                ? `Agent en erreur: ${info.error}`
                : `Agent en cours (${info.iterations} itérations, ${info.tool_calls_count} tool calls)...`,
          };
        }

        case 'continue': {
          const agentId = input.agent_id as string;
          const query = input.query as string;

          if (!agentId) {
            return { success: false, error: 'Le paramètre "agent_id" est requis pour continue.' };
          }
          if (!query) {
            return { success: false, error: 'Le paramètre "query" est requis pour continue.' };
          }

          const agentInfo = await manager.continueAgent(agentId, query);

          return {
            success: true,
            agent_id: agentInfo.agent_id,
            status: agentInfo.status,
            message: `Agent ${agentId} relancé avec nouvelle query.`,
          };
        }

        default:
          return { success: false, error: `Action inconnue: ${action}. Actions disponibles: create, add, retrieve, continue.` };
      }
    } catch (error) {
      return {
        success: false,
        error: `Erreur swarm: ${(error as Error).message}`,
      };
    }
  },
};
