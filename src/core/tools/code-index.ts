/**
 * Tool: code_index - Gère l'indexation de projets de code
 * 
 * Permet d'ajouter, rafraîchir, lister et supprimer des projets indexés.
 * Chaque projet est identifié par un nom unique et indexé séparément.
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { getMemory } from '../memory';
import { getCodeEmbeddingService } from '../code-embedding';
import { getCodeIndexer, initCodeIndexer, listIndexedProjects, removeCodeIndexer, indexerRegistry } from '../code-indexer';
import * as fs from 'fs';
import * as path from 'path';

export const codeIndexDefinition: Tool = {
  name: 'code_index',
  description: 'Gère l\'indexation de projets de code pour la recherche sémantique. Permet d\'ajouter un nouveau projet, rafraîchir un projet existant, lister les projets indexés, ou supprimer un projet. Les projets indexés peuvent ensuite être recherchés avec retrieve_code en spécifiant le nom du projet.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'refresh', 'list', 'remove'],
        description: 'Action à effectuer: add (indexer nouveau projet), refresh (mettre à jour), list (lister les projets), remove (supprimer)'
      },
      project_path: {
        type: 'string',
        description: 'Chemin absolu du projet à indexer (requis pour add/refresh)'
      },
      project_name: {
        type: 'string',
        description: 'Nom unique du projet (requis pour add/refresh/remove)'
      }
    },
    required: ['action']
  }
};

export const codeIndexHandler: ToolHandler = {
  name: 'code_index',
  definition: codeIndexDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const action = input.action as 'add' | 'refresh' | 'list' | 'remove';
    const projectName = input.project_name as string | undefined;
    const projectPath = input.project_path as string | undefined;

    const memory = getMemory();

    try {
      switch (action) {
        case 'add': {
          if (!projectName || !projectPath) {
            return {
              success: false,
              error: 'add requiert project_name et project_path'
            };
          }

          // Vérifier que le chemin existe
          if (!fs.existsSync(projectPath)) {
            return {
              success: false,
              error: `Le chemin n'existe pas: ${projectPath}`
            };
          }

          // Vérifier que ce n'est pas déjà indexé
          const existingProjects = memory.listIndexedProjects();
          if (existingProjects.includes(projectName)) {
            return {
              success: false,
              error: `Le projet '${projectName}' existe déjà. Utilisez 'refresh' pour le mettre à jour.`
            };
          }

          // Créer l'indexeur et indexer
          const embeddingService = getCodeEmbeddingService();
          const indexer = initCodeIndexer(projectPath, memory, embeddingService, projectName);
          
          console.log(`[code_index] Démarrage de l'indexation de '${projectName}'...`);
          const result = await indexer.indexAll();

          const stats = memory.getCodeEmbeddingStats(projectName);
          
          return {
            success: true,
            results: result,
            message: `✅ Projet '${projectName}' indexé avec succès\n\n📊 Statistiques:\n- ${result.indexed} fichiers nouveaux\n- ${result.updated} fichiers mis à jour\n- ${result.deleted} fichiers supprimés\n- ${stats.total_files} fichiers totaux\n- ${stats.total_tokens} tokens\n\nUtilisez 'project_name: "${projectName}"' avec retrieve_code pour chercher dans ce projet.`
          };
        }

        case 'refresh': {
          if (!projectName) {
            return {
              success: false,
              error: 'refresh requiert project_name'
            };
          }

          // Trouver l'indexeur existant ou créer un nouveau
          const embeddingService = getCodeEmbeddingService();
          let indexer: ReturnType<typeof getCodeIndexer>;
          
          if (projectPath) {
            // Nouveau chemin spécifié
            indexer = initCodeIndexer(projectPath, memory, embeddingService, projectName);
          } else {
            // Utiliser le chemin existant si l'indexeur existe
            const existingIndexer = Array.from(indexerRegistry.values()).find(i => i['projectName'] === projectName);
            if (existingIndexer) {
              indexer = existingIndexer;
            } else {
              return {
                success: false,
                error: `Projet '${projectName}' non trouvé. Spécifiez project_path ou utilisez 'add'.`
              };
            }
          }

          console.log(`[code_index] Rafraîchissement de '${projectName}'...`);
          const result = await indexer.indexAll();

          const stats = memory.getCodeEmbeddingStats(projectName);

          return {
            success: true,
            results: result,
            message: `🔄 Projet '${projectName}' rafraîchi\n\n📊 Statistiques:\n- ${result.indexed} fichiers nouveaux\n- ${result.updated} fichiers mis à jour\n- ${result.deleted} fichiers supprimés\n- ${stats.total_files} fichiers totaux`
          };
        }

        case 'list': {
          const projects = memory.listIndexedProjects();
          
          if (projects.length === 0) {
            return {
              success: true,
              results: [],
              message: '📂 Aucun projet indexé. Utilisez `code_index` avec action=add pour indexer un projet.'
            };
          }

          const projectDetails = projects.map(name => {
            const stats = memory.getCodeEmbeddingStats(name);
            return {
              name,
              files: stats.total_files,
              tokens: stats.total_tokens,
              last_indexed: stats.last_indexed
            };
          });

          const lines = projectDetails.map(p => {
            return `• **${p.name}**: ${p.files} fichiers, ${p.tokens} tokens (dernier index: ${p.last_indexed || 'N/A'})`;
          });

          return {
            success: true,
            results: projectDetails,
            message: `## 📂 Projets indexés (${projects.length})\n\n${lines.join('\n')}\n\nUtilisez retrieve_code avec project_name="nom_du_projet" pour chercher dans un projet spécifique.`
          };
        }

        case 'remove': {
          if (!projectName) {
            return {
              success: false,
              error: 'remove requiert project_name'
            };
          }

          const projects = memory.listIndexedProjects();
          if (!projects.includes(projectName)) {
            return {
              success: false,
              error: `Projet '${projectName}' non trouvé.`
            };
          }

          // Supprimer de la DB
          memory.deleteProjectEmbeddings(projectName);
          
          // Supprimer du registre
          removeCodeIndexer('', projectName); // Le chemin n'importe pas pour la suppression

          return {
            success: true,
            message: `🗑️ Projet '${projectName}' supprimé de l'index.`
          };
        }

        default:
          return {
            success: false,
            error: `Action inconnue: ${action}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: `Erreur: ${(error as Error).message}`
      };
    }
  }
};


