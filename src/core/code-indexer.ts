/**
 * CodeIndexer - Indexe la codebase de DangerousBot en arrière-plan
 * Utilisé lors du self_update et au démarrage
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { Memory } from './memory';
import { CodeEmbeddingService } from './code-embedding';

export interface IndexingResult {
  indexed: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export class CodeIndexer {
  private memory: Memory;
  private embeddingService: CodeEmbeddingService;
  private projectRoot: string;
  private projectName: string;
  private isIndexing: boolean = false;

  constructor(projectRoot: string, memory: Memory, embeddingService: CodeEmbeddingService, projectName: string = 'dangerousbot') {
    this.projectRoot = projectRoot;
    this.memory = memory;
    this.embeddingService = embeddingService;
    this.projectName = projectName;
  }

  /**
   * Liste tous les fichiers source du projet
   */
  private getSourceFiles(): string[] {
    const srcDir = path.join(this.projectRoot, 'src');
    const files: string[] = [];

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.projectRoot, fullPath);

        if (entry.isDirectory()) {
          // Ignorer node_modules et autres dossiers non pertinents
          if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
            continue;
          }
          walk(fullPath);
        } else if (entry.isFile() && this.shouldIndexFile(entry.name)) {
          files.push(relativePath);
        }
      }
    };

    walk(srcDir);
    return files;
  }

  /**
   * Détermine si un fichier doit être indexé
   */
  private shouldIndexFile(filename: string): boolean {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'];
    const ext = path.extname(filename).toLowerCase();
    return extensions.includes(ext) && !filename.endsWith('.d.ts');
  }

  /**
   * Calcule le hash MD5 du contenu
   */
  private computeHash(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * Indexe un fichier unique
   */
  private async indexFile(filePath: string): Promise<{ indexed: boolean; updated: boolean; error?: string }> {
    try {
      const fullPath = path.join(this.projectRoot, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);
      const hash = this.computeHash(content);

      // Vérifier si le fichier est déjà indexé et à jour pour ce projet
      const existing = this.memory.getCodeEmbedding(filePath, this.projectName);
      if (existing && existing.content_hash === hash) {
        return { indexed: false, updated: false }; // Déjà à jour
      }

      // Générer l'embedding
      const result = await this.embeddingService.embedCode(content, filePath);

      // Sauvegarder dans la DB avec le nom du projet
      this.memory.addCodeEmbedding(
        filePath,
        content,
        hash,
        result.vector,
        result.tokenCount,
        stats.size,
        stats.mtime.toISOString(),
        this.projectName
      );

      return { indexed: true, updated: existing ? true : false };
    } catch (error) {
      return { indexed: false, updated: false, error: `${filePath}: ${(error as Error).message}` };
    }
  }

  /**
   * Indexe toute la codebase (appelé au démarrage)
   */
  async indexAll(): Promise<IndexingResult> {
    if (this.isIndexing) {
      console.log('[CodeIndexer] Indexation déjà en cours...');
      return { indexed: 0, updated: 0, deleted: 0, errors: ['Already indexing'] };
    }

    this.isIndexing = true;
    console.log('[CodeIndexer] Démarrage de l\'indexation...');

    const result: IndexingResult = { indexed: 0, updated: 0, deleted: 0, errors: [] };

    try {
      // 1. Lister tous les fichiers source
      const sourceFiles = this.getSourceFiles();
      console.log(`[CodeIndexer] ${sourceFiles.length} fichiers à indexer`);

      // 2. Récupérer tous les fichiers déjà indexés
      const indexedFiles = new Set(
        this.memory.getAllCodeEmbeddings().map(e => e.file_path)
      );

      // 3. Indexer les fichiers (par batch de 10 pour éviter de surcharger l'API)
      const batchSize = 10;
      for (let i = 0; i < sourceFiles.length; i += batchSize) {
        const batch = sourceFiles.slice(i, i + batchSize);
        console.log(`[CodeIndexer] Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(sourceFiles.length/batchSize)}`);

        for (const filePath of batch) {
          const fileResult = await this.indexFile(filePath);
          
          if (fileResult.error) {
            result.errors.push(fileResult.error);
          } else if (fileResult.updated) {
            result.updated++;
          } else if (fileResult.indexed) {
            result.indexed++;
          }
        }

        // Petite pause entre les batches
        if (i + batchSize < sourceFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // 4. Supprimer les fichiers qui n'existent plus (pour ce projet uniquement)
      const projectIndexedFiles = new Set(
        this.memory.getAllCodeEmbeddings(this.projectName).map(e => e.file_path)
      );
      for (const indexedFile of projectIndexedFiles) {
        if (!sourceFiles.includes(indexedFile)) {
          this.memory.deleteCodeEmbedding(indexedFile, this.projectName);
          result.deleted++;
        }
      }

      // 5. Afficher les stats
      const stats = this.memory.getCodeEmbeddingStats(this.projectName);
      console.log(`[CodeIndexer] [${this.projectName}] Terminé! ${result.indexed} nouveaux, ${result.updated} mis à jour, ${result.deleted} supprimés`);
      console.log(`[CodeIndexer] [${this.projectName}] Total: ${stats.total_files} fichiers, ${stats.total_tokens} tokens`);

    } catch (error) {
      result.errors.push(`Global error: ${(error as Error).message}`);
    } finally {
      this.isIndexing = false;
    }

    return result;
  }

  /**
   * Indexe uniquement les fichiers modifiés (appelé après self_update)
   */
  async indexModifiedFiles(filePaths: string[]): Promise<IndexingResult> {
    if (this.isIndexing) {
      return { indexed: 0, updated: 0, deleted: 0, errors: ['Already indexing'] };
    }

    this.isIndexing = true;
    console.log(`[CodeIndexer] Indexation de ${filePaths.length} fichiers modifiés...`);

    const result: IndexingResult = { indexed: 0, updated: 0, deleted: 0, errors: [] };

    try {
      for (const filePath of filePaths) {
        // Ignorer les fichiers hors du dossier src
        if (!filePath.startsWith('src/')) {
          continue;
        }

        // Si le fichier a été supprimé
        const fullPath = path.join(this.projectRoot, filePath);
        if (!fs.existsSync(fullPath)) {
          this.memory.deleteCodeEmbedding(filePath);
          result.deleted++;
          continue;
        }

        // Sinon, indexer le fichier
        const fileResult = await this.indexFile(filePath);
        if (fileResult.error) {
          result.errors.push(fileResult.error);
        } else if (fileResult.updated) {
          result.updated++;
        } else if (fileResult.indexed) {
          result.indexed++;
        }
      }

      console.log(`[CodeIndexer] Incrémental: ${result.indexed} nouveaux, ${result.updated} mis à jour, ${result.deleted} supprimés`);
    } finally {
      this.isIndexing = false;
    }

    return result;
  }

  /**
   * Supprime tous les embeddings de ce projet (utile pour reset)
   */
  clearProject(): void {
    this.memory.deleteProjectEmbeddings(this.projectName);
    console.log(`[CodeIndexer] [${this.projectName}] Projet supprimé de l'index`);
  }

  /**
   * Vérifie si l'indexation est nécessaire (au démarrage)
   */
  needsIndexing(): boolean {
    const sourceFiles = this.getSourceFiles();
    const indexedCount = this.memory.getCodeEmbeddingStats(this.projectName).total_files;
    return sourceFiles.length !== indexedCount;
  }

  /**
   * Liste les projets indexés
   */
  listProjects(): string[] {
    return this.memory.listIndexedProjects();
  }

  /**
   * Supprime un projet de l'index
   */
  removeProject(projectName: string): void {
    if (projectName === this.projectName) {
      this.memory.deleteProjectEmbeddings(projectName);
      console.log(`[CodeIndexer] Projet '${projectName}' supprimé de l'index`);
    }
  }
}

// Registry pour gérer plusieurs indexeurs
export const indexerRegistry: Map<string, CodeIndexer> = new Map();

/**
 * Récupère ou crée un indexeur pour un projet
 */
export function getCodeIndexer(projectRoot: string, memory: Memory, embeddingService: CodeEmbeddingService, projectName: string = 'dangerousbot'): CodeIndexer {
  const key = `${projectRoot}:${projectName}`;
  if (!indexerRegistry.has(key)) {
    indexerRegistry.set(key, new CodeIndexer(projectRoot, memory, embeddingService, projectName));
  }
  return indexerRegistry.get(key)!;
}

/**
 * Crée un nouvel indexeur (force la création d'une nouvelle instance)
 */
export function initCodeIndexer(projectRoot: string, memory: Memory, embeddingService: CodeEmbeddingService, projectName: string = 'dangerousbot'): CodeIndexer {
  const key = `${projectRoot}:${projectName}`;
  const indexer = new CodeIndexer(projectRoot, memory, embeddingService, projectName);
  indexerRegistry.set(key, indexer);
  return indexer;
}

/**
 * Supprime un indexeur du registre
 */
export function removeCodeIndexer(projectRoot: string, projectName: string): void {
  const key = `${projectRoot}:${projectName}`;
  indexerRegistry.delete(key);
}

/**
 * Liste tous les projets indexés (via n'importe quel indexeur)
 */
export function listIndexedProjects(memory: Memory): string[] {
  return memory.listIndexedProjects();
}
