/**
 * Tool: swarm - Exécution parallèle de queries IA indépendantes
 *
 * swarm(query1|||query2|||...) → exécute toutes les queries en parallèle,
 * attend la fin, retourne tous les résultats.
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { executeSwarm } from '../swarm-manager';

export const swarmDefinition: Tool = {
  name: 'swarm',
  description: `Exécute plusieurs queries IA en parallèle via des agents indépendants avec tool calls.

Chaque query est traitée par un agent autonome avec son propre provider et tool-loop.
Les agents ont accès aux tools: read_file, write_file, edit_file, list_files, delete_file, execute_code, shell, searxng_search, retrieve_code, code_index, remember, recall, wait.

Configuration via config():
- swarm.model: Provider et modèle (défaut: mistral). Format: "provider" ou "provider:model_id"
- swarm.max_iterations: Max itérations tool-loop par agent (défaut: 25)

Usage: swarm({ queries: "query1 ici|||query2 ici|||query3 ici" })
Le séparateur est "|||".`,
  input_schema: {
    type: 'object',
    properties: {
      queries: {
        type: 'string',
        description: 'Queries séparées par "|||". Chaque query sera exécutée par un agent indépendant en parallèle.',
      },
    },
    required: ['queries'],
  },
};

export const swarmHandler: ToolHandler = {
  name: 'swarm',
  definition: swarmDefinition,

  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const queriesStr = input.queries as string;

    if (!queriesStr) {
      return { success: false, error: 'Le paramètre "queries" est requis.' };
    }

    const queries = queriesStr.split('|||').map(q => q.trim()).filter(q => q.length > 0);

    if (queries.length === 0) {
      return { success: false, error: 'Aucune query valide fournie.' };
    }

    try {
      const result = await executeSwarm(queries);
      return {
        success: result.success,
        results: result.results,
        message: `${result.results.filter(r => r.success).length}/${result.results.length} agent(s) terminé(s) avec succès.`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Erreur swarm: ${(error as Error).message}`,
      };
    }
  },
};
