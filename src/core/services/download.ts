/**
 * DownloadService - Téléchargement et gestion des fichiers
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import * as os from 'os';
import { configService } from './config';

const DATA_DIR = path.join(os.homedir(), '.dangerousbot', 'data');
const DB_PATH = path.join(DATA_DIR, 'dangerousbot.db');

function getDb(): Database.Database {
  return new Database(DB_PATH);
}

export interface FileRecord {
  id: number;
  url: string;
  filename: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number;
  source: 'webapp' | 'telegram';
  telegram_chat_id: string | null;
  downloaded_at: string;
  accessed_at: string | null;
  deleted_at: string | null;
  is_deleted: number;
}

export interface DownloadResult {
  success: boolean;
  fileId?: number;
  filename?: string;
  path?: string;
  size?: number;
  mimeType?: string;
  error?: string;
}

export class DownloadService {
  private static instance: DownloadService;
  private downloadsDir: string;

  static getInstance(): DownloadService {
    if (!DownloadService.instance) {
      DownloadService.instance = new DownloadService();
    }
    return DownloadService.instance;
  }

  constructor() {
    this.downloadsDir = path.join(process.cwd(), 'downloads');
    this.ensureDownloadsDir();
  }

  private ensureDownloadsDir(): void {
    if (!fs.existsSync(this.downloadsDir)) {
      fs.mkdirSync(this.downloadsDir, { recursive: true });
    }
  }

  /**
   * Télécharge un fichier depuis une URL
   */
  async downloadFile(
    url: string,
    options: {
      filename?: string;
      source?: 'webapp' | 'telegram';
      telegramChatId?: string;
    } = {}
  ): Promise<DownloadResult> {
    try {
      // Vérifier l'espace disponible avant téléchargement
      const hasSpace = await this.checkStorageSpace();
      if (!hasSpace) {
        // Nettoyer les anciens fichiers
        await this.cleanupOldFiles();
      }

      // Générer le nom de fichier
      const originalName = options.filename || this.extractFilenameFromUrl(url);
      const safeFilename = this.sanitizeFilename(originalName);
      const uniqueFilename = `${Date.now()}_${safeFilename}`;
      const filePath = path.join(this.downloadsDir, uniqueFilename);

      // Télécharger le fichier
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Récupérer le content-type
      const mimeType = response.headers.get('content-type') || 'application/octet-stream';

      // Sauvegarder le fichier
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      const size = buffer.length;

      // Enregistrer en base de données
      const db = getDb();
      const result = db.prepare(`
        INSERT INTO files (url, filename, original_name, mime_type, size_bytes, source, telegram_chat_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        url,
        uniqueFilename,
        originalName,
        mimeType,
        size,
        options.source || 'webapp',
        options.telegramChatId || null
      );

      const fileId = result.lastInsertRowid as number;

      // Mettre à jour la date d'accès
      db.prepare('UPDATE files SET accessed_at = CURRENT_TIMESTAMP WHERE id = ?').run(fileId);
      db.close();

      return {
        success: true,
        fileId,
        filename: uniqueFilename,
        path: filePath,
        size,
        mimeType
      };

    } catch (error) {
      return {
        success: false,
        error: `Erreur de téléchargement: ${(error as Error).message}`
      };
    }
  }

  /**
   * Récupère un fichier par son ID
   */
  async getFile(fileId: number): Promise<FileRecord | null> {
    const db = getDb();
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND is_deleted = 0').get(fileId) as FileRecord | undefined;
    
    if (file) {
      // Mettre à jour la date d'accès
      db.prepare('UPDATE files SET accessed_at = CURRENT_TIMESTAMP WHERE id = ?').run(fileId);
    }
    
    db.close();
    return file || null;
  }

  /**
   * Récupère un fichier par son nom
   */
  async getFileByName(filename: string): Promise<FileRecord | null> {
    const db = getDb();
    const file = db.prepare('SELECT * FROM files WHERE filename = ? AND is_deleted = 0').get(filename) as FileRecord | null;
    db.close();
    return file;
  }

  /**
   * Récupère le chemin complet d'un fichier
   */
  getFilePath(filename: string): string {
    return path.join(this.downloadsDir, filename);
  }

  /**
   * Supprime un fichier physiquement et en base
   */
  async deleteFile(fileId: number): Promise<boolean> {
    const file = await this.getFile(fileId);
    
    if (!file) return false;

    const db = getDb();

    try {
      // Supprimer physiquement
      const filePath = this.getFilePath(file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Marquer comme supprimé en base
      db.prepare('UPDATE files SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(fileId);
      db.close();

      return true;
    } catch (error) {
      db.close();
      console.error('[DownloadService] Erreur suppression:', error);
      return false;
    }
  }

  /**
   * Vérifie s'il y a assez d'espace selon la limite configurée
   */
  async checkStorageSpace(): Promise<boolean> {
    const limitBytes = await configService.getStorageLimitBytes();
    const currentSize = await this.getTotalSize();
    return currentSize < limitBytes;
  }

  /**
   * Calcule la taille totale des fichiers stockés
   */
  async getTotalSize(): Promise<number> {
    const db = getDb();
    const result = db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as total FROM files WHERE is_deleted = 0').get() as { total: number };
    db.close();
    return result.total;
  }

  /**
   * Nettoie les anciens fichiers pour libérer de l'espace
   */
  async cleanupOldFiles(): Promise<number> {
    const limitBytes = await configService.getStorageLimitBytes();
    let currentSize = await this.getTotalSize();
    let deletedCount = 0;

    // Si on dépasse la limite, supprimer les plus anciens
    while (currentSize > limitBytes) {
      const db = getDb();
      const oldestFile = db.prepare(
        'SELECT * FROM files WHERE is_deleted = 0 ORDER BY accessed_at ASC, downloaded_at ASC LIMIT 1'
      ).get() as FileRecord | undefined;
      db.close();

      if (!oldestFile) break;

      await this.deleteFile(oldestFile.id);
      currentSize = await this.getTotalSize();
      deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Liste tous les fichiers actifs
   */
  async listFiles(source?: 'webapp' | 'telegram'): Promise<FileRecord[]> {
    const db = getDb();
    
    let files: FileRecord[];
    if (source) {
      files = db.prepare('SELECT * FROM files WHERE is_deleted = 0 AND source = ? ORDER BY downloaded_at DESC').all(source) as FileRecord[];
    } else {
      files = db.prepare('SELECT * FROM files WHERE is_deleted = 0 ORDER BY downloaded_at DESC').all() as FileRecord[];
    }
    
    db.close();
    return files;
  }

  /**
   * Extrait le nom de fichier d'une URL
   */
  private extractFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || 'download';
      return filename || 'unnamed_file';
    } catch {
      return 'download';
    }
  }

  /**
   * Nettoie le nom de fichier pour éviter les problèmes
   */
  private sanitizeFilename(filename: string): string {
    // Remplacer les caractères problématiques
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);
  }
}

// Export singleton
export const downloadService = DownloadService.getInstance();
