/**
 * Tool: searxng_search - Recherche web via SearxNG
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const searxngSearchDefinition: Tool = {
  name: 'searxng_search',
  description: 'Effectue une recherche web privée via une instance SearxNG self-hosted, avec restriction per-query des sources autorisées (engines/categories). Retourne les résultats en JSON.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'La requête de recherche (obligatoire).' },
      engines: { type: 'string', description: 'Liste comma-separated des engines autorisés uniquement (ex: "google,bing,duckduckgo"). Laisse vide pour tous les engines configurés.' },
      categories: { type: 'string', description: 'Liste comma-separated des catégories autorisées (ex: "general,images,news").' },
      language: { type: 'string', description: "Code langue ISO (ex: 'fr-FR', 'en-US')." },
      time_range: { type: 'string', enum: ['day', 'month', 'year', null], description: 'Restriction temporelle pour engines compatibles.' },
      safesearch: { type: 'integer', enum: [0, 1, 2], description: 'Niveau safe search (0=none, 1=moderate, 2=strict).' },
      pageno: { type: 'integer', description: 'Numéro de page (default 1).', default: 1 }
    },
    required: ['query']
  }
};

export const searxngSearchHandler: ToolHandler = {
  name: 'searxng_search',
  definition: searxngSearchDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    try {
      const query = input.query as string;
      const engines = (input.engines as string) || 'google';
      const categories = (input.categories as string) || 'general';
      const language = (input.language as string) || 'fr-FR';
      const timeRange = input.time_range as string | undefined;
      const safeSearch = (input.safesearch as number) ?? 0;
      const pageNo = (input.pageno as number) || 1;

      const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';
      
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        language: language,
        safesearch: safeSearch.toString(),
        pageno: pageNo.toString()
      });

      if (engines) {
        params.append('engines', engines);
      }
      if (categories) {
        params.append('categories', categories);
      }
      if (timeRange) {
        params.append('time_range', timeRange);
      }

      const response = await fetch(`${searxngUrl}/search?${params.toString()}`, {
        headers: {
          'Accept': 'application/json',
          'X-Forwarded-For': '127.0.0.1'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          error: `SearxNG Error: ${response.status} - ${await response.text()}`
        };
      }

      const data = await response.json();
      
      const results = data.results?.map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        engine: r.engine,
        score: r.score
      })) || [];

      const formatted = results.slice(0, 10).map((r: any, i: number) => {
        return `**${i + 1}. ${r.title}**\n${r.url}\n${r.content?.substring(0, 200) || ''}${r.content?.length > 200 ? '...' : ''}`;
      }).join('\n\n');

      return {
        success: true,
        query: query,
        engines: engines,
        total_results: data.number_of_results || results.length,
        results: results.slice(0, 10),
        message: `## 🔍 Résultats pour: "${query}"\n\n*Moteurs: ${engines}*\n\n${formatted || 'Aucun résultat trouvé.'}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Erreur SearxNG: ${(error as Error).message}`
      };
    }
  }
};
