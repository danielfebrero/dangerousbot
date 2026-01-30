/**
 * MemoryCompressor - Compresse l'historique de conversation
 * 
 * Stratégie:
 * 1. Surveille la taille de l'historique
 * 2. Quand le seuil est atteint, compresse les anciens messages en résumé
 * 3. Stocke le résumé avec son embedding pour recherche future
 * 4. Garde les N derniers messages intacts pour le contexte immédiat
 */

import Anthropic from '@anthropic-ai/sdk';
import { getMemory, Memory } from './memory';
import { getEmbeddingService, EmbeddingService } from './embedding';
import { Message } from './types';

// Configuration
const COMPRESSION_THRESHOLD = 30;  // Nombre de messages avant compression
const KEEP_RECENT = 10;            // Messages récents à garder intacts
const COMPRESSION_MODEL = 'claude-sonnet-4-20250514';  // Modèle léger pour résumer

export interface CompressedMemory {
  id?: number;
  session_id: string;
  summary: string;
  message_ids: number[];  // IDs des messages compressés
  start_time: string;
  end_time: string;
  embedding?: number[];
  created_at?: string;
}

export class MemoryCompressor {
  private anthropic: Anthropic;
  private memory: Memory;
  private embedding: EmbeddingService;

  constructor(anthropicApiKey: string) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.memory = getMemory();
    this.embedding = getEmbeddingService();
  }

  /**
   * Vérifie si une compression est nécessaire et l'exécute
   */
  async checkAndCompress(): Promise<boolean> {
    const messages = this.memory.getMessages(undefined, 1000);
    
    if (messages.length < COMPRESSION_THRESHOLD) {
      return false;
    }

    // Messages à compresser (tous sauf les N derniers)
    const toCompress = messages.slice(0, messages.length - KEEP_RECENT);
    
    if (toCompress.length < 10) {
      return false;  // Pas assez pour justifier une compression
    }

    console.log(`[Compressor] Compressing ${toCompress.length} messages...`);
    
    await this.compressMessages(toCompress);
    return true;
  }

  /**
   * Compresse un ensemble de messages en résumé
   */
  private async compressMessages(messages: Message[]): Promise<CompressedMemory> {
    // Formater les messages pour le résumé
    const conversation = messages.map(m => 
      `[${m.role.toUpperCase()}]: ${m.content}`
    ).join('\n\n');

    // Générer le résumé via Claude
    const response = await this.anthropic.messages.create({
      model: COMPRESSION_MODEL,
      max_tokens: 1024,
      system: `Tu es un assistant qui résume des conversations de manière concise mais complète.
Extrais les informations clés:
- Décisions prises
- Informations apprises sur l'utilisateur
- Actions effectuées
- Contexte important pour la suite

Format: Un résumé structuré et factuel, sans fluff.`,
      messages: [{
        role: 'user',
        content: `Résume cette conversation:\n\n${conversation}`
      }]
    });

    const summary = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Générer l'embedding du résumé
    const embeddingResult = await this.embedding.embed(summary);

    // Créer l'objet mémoire compressée
    const compressed: CompressedMemory = {
      session_id: messages[0].session_id,
      summary,
      message_ids: messages.map(m => m.id!).filter(Boolean),
      start_time: messages[0].timestamp,
      end_time: messages[messages.length - 1].timestamp,
      embedding: embeddingResult.vector
    };

    // Sauvegarder dans la DB
    this.saveCompressedMemory(compressed);

    // Supprimer les messages originaux (optionnel - pour l'instant on garde)
    // this.deleteCompressedMessages(compressed.message_ids);

    console.log(`[Compressor] Created summary (${summary.length} chars)`);

    return compressed;
  }

  /**
   * Sauvegarde une mémoire compressée dans la DB
   */
  private saveCompressedMemory(compressed: CompressedMemory): number {
    const db = (this.memory as any).db;
    
    // Créer la table si elle n'existe pas
    db.exec(`
      CREATE TABLE IF NOT EXISTS compressed_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        message_ids TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        embedding BLOB,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_compressed_session ON compressed_memories(session_id);
    `);

    const stmt = db.prepare(`
      INSERT INTO compressed_memories (session_id, summary, message_ids, start_time, end_time, embedding)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      compressed.session_id,
      compressed.summary,
      JSON.stringify(compressed.message_ids),
      compressed.start_time,
      compressed.end_time,
      compressed.embedding ? Buffer.from(new Float32Array(compressed.embedding).buffer) : null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Récupère toutes les mémoires compressées pour une session
   */
  getCompressedMemories(sessionId?: string): CompressedMemory[] {
    const db = (this.memory as any).db;
    const sid = sessionId || this.memory.getSessionId();

    try {
      const rows = db.prepare(`
        SELECT * FROM compressed_memories
        WHERE session_id = ?
        ORDER BY created_at ASC
      `).all(sid) as any[];

      return rows.map(row => ({
        id: row.id,
        session_id: row.session_id,
        summary: row.summary,
        message_ids: JSON.parse(row.message_ids),
        start_time: row.start_time,
        end_time: row.end_time,
        embedding: row.embedding ? Array.from(new Float32Array(row.embedding.buffer)) : undefined,
        created_at: row.created_at
      }));
    } catch {
      return [];  // Table n'existe pas encore
    }
  }

  /**
   * Recherche les mémoires pertinentes par similarité sémantique
   */
  async searchRelevantMemories(query: string, topK: number = 3): Promise<CompressedMemory[]> {
    const allMemories = this.getCompressedMemories();
    
    if (allMemories.length === 0) {
      return [];
    }

    // Générer l'embedding de la query
    const queryEmbedding = await this.embedding.embed(query);

    // Filtrer les mémoires avec embeddings
    const withEmbeddings = allMemories.filter(m => m.embedding && m.embedding.length > 0);

    if (withEmbeddings.length === 0) {
      return allMemories.slice(0, topK);  // Fallback: retourner les plus récentes
    }

    // Calculer les similarités
    const candidates = withEmbeddings.map(m => ({
      id: m.id!,
      vector: m.embedding!
    }));

    const topResults = EmbeddingService.findTopK(queryEmbedding.vector, candidates, topK);

    // Récupérer les mémoires correspondantes
    return topResults.map(result => 
      withEmbeddings.find(m => m.id === result.id)!
    );
  }
}

// Singleton
let compressorInstance: MemoryCompressor | null = null;

export function getCompressor(): MemoryCompressor {
  if (!compressorInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    compressorInstance = new MemoryCompressor(apiKey);
  }
  return compressorInstance;
}

export function initCompressor(anthropicApiKey: string): MemoryCompressor {
  compressorInstance = new MemoryCompressor(anthropicApiKey);
  return compressorInstance;
}
