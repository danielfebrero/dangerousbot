/**
 * ContextInjector - Injecte le contexte pertinent avant chaque requête
 * 
 * Responsabilités:
 * 1. Récupérer les mémoires compressées pertinentes de TOUS les threads
 * 2. Récupérer les connaissances pertinentes (facts, preferences, etc.)
 * 3. Construire un bloc de contexte à injecter dans le system prompt
 * 4. Indiquer quelles conversations sont liées aux souvenirs trouvés
 */

import { getMemory, Memory } from './memory';
import { getCompressor, MemoryCompressor, CompressedMemory } from './compressor';
import { getEmbeddingService, EmbeddingService } from './embedding';
import { getThreadManager, ThreadManager } from './thread-manager.js';
import { Knowledge } from './types';
import { PROVIDER } from '../config.js';
import { logger } from './logger.js';

export interface InjectedContext {
  memories: Array<{
    content: string;
    threadId: string;
    threadTitle: string;
    isFromCurrentThread: boolean;
    similarity: number;
  }>;
  knowledge: string[];
  recentSummary?: string;
}

export class ContextInjector {
  private memory: Memory;
  private compressor: MemoryCompressor | null;
  private embedding: EmbeddingService;
  private threadManager: ThreadManager;

  constructor() {
    this.memory = getMemory();
    this.compressor = getCompressor();
    this.embedding = getEmbeddingService();
    this.threadManager = getThreadManager();
  }

  /**
   * Génère le contexte à injecter basé sur le message utilisateur
   * Recherche dans tous les threads, pas seulement le thread actuel
   */
  async getRelevantContext(
    userMessage: string,
    currentThreadId?: string
  ): Promise<InjectedContext> {
    const context: InjectedContext = {
      memories: [],
      knowledge: []
    };

    // 1. Récupérer les mémoires compressées pertinentes de TOUS les threads
    try {
      if (this.compressor) {
        const allThreads = this.threadManager.listThreads(true);
        const memoriesFromAllThreads: Array<{
          content: string;
          threadId: string;
          threadTitle: string;
          similarity: number;
        }> = [];

        for (const thread of allThreads) {
          const threadMemories = this.compressor.getCompressedMemories(thread.id);
          
          if (threadMemories.length === 0) continue;

          // Générer l'embedding de la query
          const queryEmbedding = await this.embedding.embed(userMessage);

          // Calculer la similarité avec chaque mémoire
          for (const memory of threadMemories) {
            if (!memory.embedding || memory.embedding.length === 0) continue;

            const similarity = this.cosineSimilarity(
              queryEmbedding.vector,
              memory.embedding
            );

            if (similarity > 0.7) { // Seulement les mémoires pertinentes
              memoriesFromAllThreads.push({
                content: memory.summary,
                threadId: thread.id,
                threadTitle: thread.title,
                similarity,
              });
            }
          }
        }

        // Trier par similarité et prendre les meilleures
        memoriesFromAllThreads.sort((a, b) => b.similarity - a.similarity);
        const topMemories = memoriesFromAllThreads.slice(0, 5);

        context.memories = topMemories.map(m => ({
          content: m.content,
          threadId: m.threadId,
          threadTitle: m.threadTitle,
          isFromCurrentThread: m.threadId === currentThreadId,
          similarity: m.similarity,
        }));
      }
    } catch (error) {
      console.error('[ContextInjector] Error fetching cross-thread memories:', error);
    }

    // 2. Récupérer les connaissances pertinentes
    try {
      const allKnowledge = this.memory.getKnowledge();
      
      if (allKnowledge.length > 0) {
        context.knowledge = allKnowledge.map(k => `[${k.type.toUpperCase()}] ${k.content}`);
      }
    } catch (error) {
      console.error('[ContextInjector] Error fetching knowledge:', error);
    }

    // 3. Vérifier si on a des résumés de session pour le thread actuel
    try {
      if (this.compressor && currentThreadId) {
        const sessionMemories = this.compressor.getCompressedMemories(currentThreadId);
        if (sessionMemories.length > 0) {
          const latest = sessionMemories[sessionMemories.length - 1];
          context.recentSummary = latest.summary;
        }
      }
    } catch (error) {
      console.error('[ContextInjector] Error fetching session summary:', error);
    }

    return context;
  }

  /**
   * Calcule la similarité cosinus entre deux vecteurs
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Formate le contexte en bloc texte pour injection dans le system prompt
   * Indique clairement la provenance de chaque souvenir
   */
  formatContextBlock(context: InjectedContext, currentThreadTitle?: string): string {
    const sections: string[] = [];

    // Section configuration système
    sections.push(this.buildConfigSection());

    // Section mémoires de conversations
    if (context.memories.length > 0) {
      const currentThreadMemories = context.memories.filter(m => m.isFromCurrentThread);
      const otherThreadMemories = context.memories.filter(m => !m.isFromCurrentThread);

      let memoriesSection = `## 📚 Mémoires de conversations pertinentes\n\n`;

      if (currentThreadMemories.length > 0) {
        memoriesSection += `### De cette conversation${currentThreadTitle ? ` "${currentThreadTitle}"` : ''}:\n\n`;
        memoriesSection += currentThreadMemories
          .map((m, i) => `- ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}`)
          .join('\n');
        memoriesSection += '\n\n';
      }

      if (otherThreadMemories.length > 0) {
        memoriesSection += `### D'autres conversations:\n\n`;
        
        // Grouper par thread
        const grouped = this.groupByThread(otherThreadMemories);
        for (const [threadId, memories] of grouped) {
          const firstMemory = memories[0];
          memoriesSection += `**Thread "${firstMemory.threadTitle}"** (ID: ${threadId}):\n`;
          memoriesSection += memories
            .map(m => `- ${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''} (similarité: ${(m.similarity * 100).toFixed(0)}%)`)
            .join('\n');
          memoriesSection += '\n\n';
        }
      }

      sections.push(memoriesSection);
    }

    // Section connaissances
    if (context.knowledge.length > 0) {
      sections.push(`## 🧠 Connaissances acquises

${context.knowledge.join('\n')}`);
    }

    // Section résumé de session
    if (context.recentSummary) {
      sections.push(`## 📝 Résumé de cette conversation

${context.recentSummary}`);
    }

    return `
---
# CONTEXTE INJECTÉ (mémoire long-terme)

${sections.join('\n\n')}

---
`;
  }

  /**
   * Groupe les mémoires par thread
   */
  private groupByThread(memories: Array<{ content: string; threadId: string; threadTitle: string; similarity: number }>):
    Map<string, Array<{ content: string; threadId: string; threadTitle: string; similarity: number }>> {
    const grouped = new Map();
    
    for (const memory of memories) {
      if (!grouped.has(memory.threadId)) {
        grouped.set(memory.threadId, []);
      }
      grouped.get(memory.threadId).push(memory);
    }
    
    return grouped;
  }

  /**
   * Construit la section de configuration système
   */
  private buildConfigSection(): string {
    const provider = PROVIDER.ACTIVE;
    const logLevel = logger.getLevel();

    return `## ⚙️ Configuration Système

- **Provider actif**: ${provider}
- **Niveau de log**: ${logLevel}`;
  }

  /**
   * Méthode principale: récupère et formate le contexte en un seul appel
   */
  async injectContext(
    userMessage: string,
    currentThreadId?: string,
    currentThreadTitle?: string
  ): Promise<string> {
    const context = await this.getRelevantContext(userMessage, currentThreadId);
    return this.formatContextBlock(context, currentThreadTitle);
  }

  /**
   * Déclenche une compression si nécessaire
   */
  async maybeCompress(threadId?: string): Promise<boolean> {
    if (!this.compressor) return false;
    return this.compressor.checkAndCompress();
  }
}

// Singleton
let injectorInstance: ContextInjector | null = null;

export function getContextInjector(): ContextInjector {
  if (!injectorInstance) {
    injectorInstance = new ContextInjector();
  }
  return injectorInstance;
}
