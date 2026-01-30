/**
 * EmbeddingService - Génère des embeddings via OpenRouter (Qwen3-embedding-8b)
 */

import { MODELS, APIS } from '../config';

export interface EmbeddingResult {
  vector: number[];
  tokenCount: number;
}

export class EmbeddingService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Génère un embedding pour un texte donné
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const response = await fetch(APIS.OPENROUTER_EMBEDDINGS, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APIS.OPENROUTER_REFERER,
        'X-Title': APIS.OPENROUTER_TITLE
      },
      body: JSON.stringify({
        model: MODELS.EMBEDDING,
        input: text
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter embedding failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
      usage?: { total_tokens: number };
    };

    return {
      vector: data.data[0].embedding,
      tokenCount: data.usage?.total_tokens || 0
    };
  }

  /**
   * Génère des embeddings pour plusieurs textes (batch)
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const response = await fetch(APIS.OPENROUTER_EMBEDDINGS, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APIS.OPENROUTER_REFERER,
        'X-Title': APIS.OPENROUTER_TITLE
      },
      body: JSON.stringify({
        model: MODELS.EMBEDDING,
        input: texts
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter batch embedding failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
      usage?: { total_tokens: number };
    };

    // Trier par index pour maintenir l'ordre
    const sorted = data.data.sort((a, b) => a.index - b.index);
    const avgTokens = Math.floor((data.usage?.total_tokens || 0) / texts.length);

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
      similarity: EmbeddingService.cosineSimilarity(queryVector, c.vector)
    }));

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }
}

// Singleton
let embeddingInstance: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingInstance) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not set');
    }
    embeddingInstance = new EmbeddingService(apiKey);
  }
  return embeddingInstance;
}

export function initEmbeddingService(apiKey: string): EmbeddingService {
  embeddingInstance = new EmbeddingService(apiKey);
  return embeddingInstance;
}
