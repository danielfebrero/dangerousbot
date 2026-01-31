/**
 * Tool: retrieve_code - Recherche sémantique dans la codebase
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { getMemory } from '../memory';
import { getCodeEmbeddingService, CodeEmbeddingService } from '../code-embedding';
import { APIS, PATHS } from '../../config';

export const retrieveCodeDefinition: Tool = {
  name: 'retrieve_code',
  description: 'Recherche sémantique dans la codebase de DangerousBot. Utilise les embeddings pour retrouver les fichiers et snippets de code les plus pertinents par rapport à une requête. Parfait pour trouver où est implémentée une fonctionnalité ou comprendre l\'architecture.',
  input_schema: {
    type: 'object',
    properties: {
      query: { 
        type: 'string', 
        description: 'Description de ce que tu cherches (ex: "fonction qui gère les embeddings", "tool self_update", etc.)' 
      },
      top_k: { 
        type: 'number', 
        description: 'Nombre de résultats à retourner (défaut: 5)' 
      }
    },
    required: ['query']
  }
};

export const retrieveCodeHandler: ToolHandler = {
  name: 'retrieve_code',
  definition: retrieveCodeDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const query = input.query as string;
    const topK = (input.top_k as number) || 5;

    try {
      // Obtenir le service d'embedding
      let embeddingService: typeof CodeEmbeddingService.prototype;
      try {
        embeddingService = getCodeEmbeddingService();
      } catch (e) {
        // Initialiser avec la clé Mistral si pas déjà fait
        const fs = await import('fs');
        const mistralKey = APIS.MISTRAL_API_KEY || (fs.existsSync(PATHS.MISTRAL_KEY_FILE) 
          ? fs.readFileSync(PATHS.MISTRAL_KEY_FILE, 'utf-8').trim()
          : '');
        
        if (!mistralKey) {
          return {
            success: false,
            error: 'Clé API Mistral non configurée (nécessaire pour les embeddings de code)'
          };
        }
        embeddingService = getCodeEmbeddingService();
      }

      // Générer l'embedding de la requête
      const queryEmbedding = await embeddingService.embedCode(query);

      // Récupérer tous les embeddings indexés
      const allEmbeddings = context.memory.getAllCodeEmbeddings();

      if (allEmbeddings.length === 0) {
        return {
          success: true,
          results: [],
          message: '📂 Aucun fichier indexé dans la base de données. Utilisez l\'indexation au démarrage.'
        };
      }

      // Formater les chemins absolus
      const path = await import('path');
      const projectRoot = context.projectRoot;

      // Calculer les similarités avec chemins absolus
      const scored = allEmbeddings.map((item: any) => ({
        file_path: item.file_path.startsWith('/') ? item.file_path : path.join(projectRoot, item.file_path),
        content: item.content,
        similarity: CodeEmbeddingService.cosineSimilarity(queryEmbedding.vector, item.embedding)
      }));

      // Trier et prendre les top_k
      const topResults = scored
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, topK);

      // Formater la réponse avec chemins absolus
      const lines = topResults.map((r: any, i: number) => {
        const pct = Math.round(r.similarity * 100);
        const preview = r.content.substring(0, 200).replace(/\n/g, ' ');
        return `**${i + 1}. ${r.file_path}** (${pct}% match)\n\`\`\`typescript\n${preview}${r.content.length > 200 ? '...' : ''}\n\`\`\``;
      });

      return {
        success: true,
        results: topResults,
        message: `## 🔍 Résultats pour: "${query}"\n\n${lines.join('\n\n')}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Erreur lors de la recherche: ${(error as Error).message}`
      };
    }
  }
};
