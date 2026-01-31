/**
 * ContextInjector - Injecte le contexte pertinent avant chaque requête
 * 
 * Responsabilités:
 * 1. Récupérer les mémoires compressées pertinentes
 * 2. Récupérer les connaissances pertinentes (facts, preferences, etc.)
 * 3. Construire un bloc de contexte à injecter dans le system prompt
 */

import { getMemory, Memory } from './memory';
import { getCompressor, MemoryCompressor, CompressedMemory } from './compressor';
import { getEmbeddingService, EmbeddingService } from './embedding';
import { Knowledge } from './types';
import { PROVIDER } from '../config.js';
import { logger } from './logger.js';

export interface InjectedContext {
  memories: string[];      // Résumés de conversations passées pertinentes
  knowledge: string[];     // Faits, préférences, skills
  recentSummary?: string;  // Résumé de la session actuelle si compressée
}

export class ContextInjector {
  private memory: Memory;
  private compressor: MemoryCompressor;
  private embedding: EmbeddingService;

  constructor() {
    this.memory = getMemory();
    this.compressor = getCompressor();
    this.embedding = getEmbeddingService();
  }

  /**
   * Génère le contexte à injecter basé sur le message utilisateur
   */
  async getRelevantContext(userMessage: string): Promise<InjectedContext> {
    const context: InjectedContext = {
      memories: [],
      knowledge: []
    };

    // 1. Récupérer les mémoires compressées pertinentes
    try {
      const relevantMemories = await this.compressor.searchRelevantMemories(userMessage, 3);
      context.memories = relevantMemories.map(m => m.summary);
    } catch (error) {
      console.error('[ContextInjector] Error fetching memories:', error);
    }

    // 2. Récupérer les connaissances pertinentes
    try {
      const allKnowledge = this.memory.getKnowledge();
      
      if (allKnowledge.length > 0) {
        // Pour l'instant, on prend tout (à améliorer avec search sémantique)
        // TODO: Ajouter embeddings aux knowledge et faire une recherche
        context.knowledge = allKnowledge.map(k => `[${k.type.toUpperCase()}] ${k.content}`);
      }
    } catch (error) {
      console.error('[ContextInjector] Error fetching knowledge:', error);
    }

    // 3. Vérifier si on a des résumés de session
    try {
      const sessionMemories = this.compressor.getCompressedMemories();
      if (sessionMemories.length > 0) {
        // Prendre le résumé le plus récent de la session
        const latest = sessionMemories[sessionMemories.length - 1];
        context.recentSummary = latest.summary;
      }
    } catch (error) {
      console.error('[ContextInjector] Error fetching session summary:', error);
    }

    return context;
  }

  /**
   * Formate le contexte en bloc texte pour injection dans le system prompt
   */
  formatContextBlock(context: InjectedContext): string {
    const sections: string[] = [];

    // Section configuration système (toujours présente)
    sections.push(this.buildConfigSection());

    // Section mémoires passées
    if (context.memories.length > 0) {
      sections.push(`## 📚 Mémoires de conversations passées

${context.memories.map((m, i) => `### Mémoire ${i + 1}\n${m}`).join('\n\n')}`);
    }

    // Section connaissances
    if (context.knowledge.length > 0) {
      sections.push(`## 🧠 Connaissances acquises

${context.knowledge.join('\n')}`);
    }

    // Section résumé de session
    if (context.recentSummary) {
      sections.push(`## 📝 Résumé de notre conversation actuelle

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
  async injectContext(userMessage: string): Promise<string> {
    const context = await this.getRelevantContext(userMessage);
    return this.formatContextBlock(context);
  }

  /**
   * Déclenche une compression si nécessaire (à appeler périodiquement)
   */
  async maybeCompress(): Promise<boolean> {
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
