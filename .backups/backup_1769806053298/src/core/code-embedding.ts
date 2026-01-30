/**
 * CodeEmbeddingService - Génère des embeddings pour le code source via Mistral (codestral-embed)
 */

import { APIS } from '../config';

export interface CodeEmbeddingResult {
  vector: number[];
  tokenCount: number;
}

export class CodeEmbeddingService {
  private apiKey: string;
  private baseUrl = 'https://api.mistral.ai/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Génère un embedding pour du code source
   */
  async embedCode(code: string, filename?: string): Promise<CodeEmbeddingResult> {
    // Préfixer avec le nom de fichier pour donner du contexte
    const input = filename ? `// File: ${filename}\n${code}` : code;
    
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'codestral-embed-2505',
        input: input,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral embedding failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { prompt_tokens: number; total_tokens: number };
    };

    return {
      vector: data.data[0].embedding,
      tokenCount: data.usage.total_tokens
    };
  }

  /**
   * Génère des embeddings pour plusieurs fichiers (batch)
   */
  async embedCodeBatch(items: Array<{ code: string; filename?: string }>): Promise<CodeEmbeddingResult[]> {
    const inputs = items.map(item => 
      item.filename ? `// File: ${item.filename}\n${item.code}` : item.code
    );

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'codestral-embed-2505',
        input: inputs,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral batch embedding failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { prompt_tokens: number; total_tokens: number };
    };

    // Trier par index pour maintenir l'ordre
    const sorted = data.data.sort((a, b) => a.index - b.index);
    const avgTokens = Math.floor(data.usage.total_tokens / items.length);

    return sorted.map(item => ({
      vector: item.embedding,
      tokenCount: avgTokens
    }));
  }

  /**
   * Calcule la similarité cosinus entre deux vecteurs
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Trouve les K vecteurs les plus similaires
   */
  static findTopK(
    queryVector: number[],
    candidates: Array<{ id: number; vector: number[] }>,
    k: number
  ): Array<{ id: number; similarity: number }> {
    const scored = candidates.map(c => ({
      id: c.id,
      similarity: CodeEmbeddingService.cosineSimilarity(queryVector, c.vector)
    }));

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }
}

// Singleton
let codeEmbeddingInstance: CodeEmbeddingService | null = null;

export function getCodeEmbeddingService(): CodeEmbeddingService {
  if (!codeEmbeddingInstance) {
    const apiKey = process.env.MISTRAL_API_KEY || '';
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY not set');
    }
    codeEmbeddingInstance = new CodeEmbeddingService(apiKey);
  }
  return codeEmbeddingInstance;
}

export function initCodeEmbeddingService(apiKey: string): CodeEmbeddingService {
  codeEmbeddingInstance = new CodeEmbeddingService(apiKey);
  return codeEmbeddingInstance;
}
