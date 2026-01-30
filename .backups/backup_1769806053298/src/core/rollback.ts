/**
 * RollbackManager - Système de rollback automatique pour DangerousBot
 * 
 * Fonctionnalités:
 * - Backup automatique avant chaque self-update
 * - Validation du build après modification
 * - Health check après redémarrage
 * - Rollback automatique si échec
 */

import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ROLLBACK } from '../config.js';

export interface BackupInfo {
  id: string;
  timestamp: string;
  description: string;
  commitHash?: string;
  files: string[];
}

export interface RollbackResult {
  success: boolean;
  message: string;
  backupId?: string;
  error?: string;
}

export class RollbackManager {
  private projectRoot: string;
  private backupDir: string;
  private manifestFile: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.backupDir = path.join(projectRoot, ROLLBACK.BACKUP_DIR);
    this.manifestFile = path.join(this.backupDir, 'manifest.json');
    this.ensureBackupDir();
  }

  private ensureBackupDir(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private async execCommand(command: string): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      exec(command, { 
        cwd: this.projectRoot, 
        timeout: ROLLBACK.BUILD_TIMEOUT,
        maxBuffer: 10 * 1024 * 1024 
      }, (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout: stdout.toString(),
          stderr: stderr.toString()
        });
      });
    });
  }

  /**
   * Charge le manifest des backups
   */
  private loadManifest(): BackupInfo[] {
    try {
      if (fs.existsSync(this.manifestFile)) {
        return JSON.parse(fs.readFileSync(this.manifestFile, 'utf-8'));
      }
    } catch (e) {
      console.warn('[Rollback] Erreur lecture manifest:', e);
    }
    return [];
  }

  /**
   * Sauvegarde le manifest
   */
  private saveManifest(backups: BackupInfo[]): void {
    fs.writeFileSync(this.manifestFile, JSON.stringify(backups, null, 2));
  }

  /**
   * Crée un backup avant modification
   */
  async createBackup(description: string, files: string[] = []): Promise<RollbackResult> {
    const backupId = `backup_${Date.now()}`;
    const backupPath = path.join(this.backupDir, backupId);

    try {
      // Créer le dossier de backup
      fs.mkdirSync(backupPath, { recursive: true });

      // Si pas de fichiers spécifiés, backup tout le src/
      const filesToBackup = files.length > 0 ? files : this.getAllSourceFiles();

      // Copier les fichiers
      for (const file of filesToBackup) {
        const srcPath = path.join(this.projectRoot, file);
        const destPath = path.join(backupPath, file);
        
        if (fs.existsSync(srcPath)) {
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.copyFileSync(srcPath, destPath);
        }
      }

      // Obtenir le hash du commit actuel
      const gitResult = await this.execCommand('git rev-parse --short HEAD');
      const commitHash = gitResult.success ? gitResult.stdout.trim() : undefined;

      // Créer l'entrée dans le manifest
      const backupInfo: BackupInfo = {
        id: backupId,
        timestamp: new Date().toISOString(),
        description,
        commitHash,
        files: filesToBackup
      };

      const backups = this.loadManifest();
      backups.unshift(backupInfo);

      // Garder seulement les N derniers backups
      while (backups.length > ROLLBACK.MAX_BACKUPS) {
        const oldBackup = backups.pop();
        if (oldBackup) {
          this.deleteBackup(oldBackup.id);
        }
      }

      this.saveManifest(backups);

      console.log(`[Rollback] Backup créé: ${backupId}`);
      return {
        success: true,
        message: `Backup créé avec ${filesToBackup.length} fichiers`,
        backupId
      };
    } catch (error) {
      return {
        success: false,
        message: 'Échec création backup',
        error: (error as Error).message
      };
    }
  }

  /**
   * Liste tous les fichiers source
   */
  private getAllSourceFiles(): string[] {
    const files: string[] = [];
    
    const walkDir = (dir: string, prefix: string = '') => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const relativePath = path.join(prefix, item.name);
        if (item.isDirectory()) {
          if (!['node_modules', 'dist', '.git', '.backups'].includes(item.name)) {
            walkDir(path.join(dir, item.name), relativePath);
          }
        } else if (item.name.endsWith('.ts') || item.name.endsWith('.tsx') || item.name.endsWith('.css')) {
          files.push(relativePath);
        }
      }
    };

    walkDir(path.join(this.projectRoot, 'src'), 'src');
    return files;
  }

  /**
   * Liste les fichiers modifiés depuis le dernier commit
   */
  async getModifiedFiles(): Promise<string[]> {
    const result = await this.execCommand('git diff --name-only HEAD');
    if (!result.success) {
      return [];
    }
    return result.stdout
      .split('\n')
      .filter(f => f.startsWith('src/'))
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  }

  /**
   * Liste les fichiers créés (nouveaux, pas encore commités)
   */
  async getNewFiles(): Promise<string[]> {
    const result = await this.execCommand('git status --porcelain');
    if (!result.success) {
      return [];
    }
    return result.stdout
      .split('\n')
      .filter(line => line.startsWith('A ') || line.startsWith('?? '))
      .map(line => line.substring(3))
      .filter(f => f.startsWith('src/'))
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  }

  /**
   * Liste les fichiers supprimés depuis le dernier commit
   */
  async getDeletedFiles(): Promise<string[]> {
    const result = await this.execCommand('git diff --name-only --diff-filter=D HEAD');
    if (!result.success) {
      return [];
    }
    return result.stdout
      .split('\n')
      .filter(f => f.startsWith('src/'))
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  }

  /**
   * Supprime un backup
   */
  private deleteBackup(backupId: string): void {
    const backupPath = path.join(this.backupDir, backupId);
    if (fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { recursive: true, force: true });
    }
  }

  /**
   * Vérifie que le build compile correctement
   */
  async validateBuild(): Promise<RollbackResult> {
    console.log('[Rollback] Validation du build...');
    
    const result = await this.execCommand('npm run build');
    
    if (result.success) {
      return {
        success: true,
        message: 'Build validé avec succès'
      };
    } else {
      return {
        success: false,
        message: 'Échec du build',
        error: result.stderr || result.stdout
      };
    }
  }

  /**
   * Effectue un health check du serveur
   */
  async healthCheck(port: number = 3000, retries: number = ROLLBACK.HEALTH_CHECK_RETRIES): Promise<RollbackResult> {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`http://localhost:${port}/api/health`);
        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            message: `Serveur OK (version: ${data.version || 'unknown'})`
          };
        }
      } catch (e) {
        // Serveur pas encore prêt
      }
      
      console.log(`[Rollback] Health check tentative ${i + 1}/${retries}...`);
      await delay(ROLLBACK.HEALTH_CHECK_INTERVAL);
    }

    return {
      success: false,
      message: `Health check échoué après ${retries} tentatives`,
      error: 'Serveur non accessible'
    };
  }

  /**
   * Restaure un backup
   */
  async restoreBackup(backupId?: string): Promise<RollbackResult> {
    const backups = this.loadManifest();
    
    if (backups.length === 0) {
      return {
        success: false,
        message: 'Aucun backup disponible',
        error: 'Manifest vide'
      };
    }

    // Utiliser le backup le plus récent si non spécifié
    const backup = backupId 
      ? backups.find(b => b.id === backupId)
      : backups[0];

    if (!backup) {
      return {
        success: false,
        message: `Backup non trouvé: ${backupId}`,
        error: 'ID invalide'
      };
    }

    const backupPath = path.join(this.backupDir, backup.id);

    try {
      console.log(`[Rollback] Restauration du backup: ${backup.id}`);

      // Restaurer les fichiers
      for (const file of backup.files) {
        const srcPath = path.join(backupPath, file);
        const destPath = path.join(this.projectRoot, file);

        if (fs.existsSync(srcPath)) {
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.copyFileSync(srcPath, destPath);
        }
      }

      console.log(`[Rollback] ${backup.files.length} fichiers restaurés`);

      return {
        success: true,
        message: `Backup ${backup.id} restauré (${backup.files.length} fichiers)`,
        backupId: backup.id
      };
    } catch (error) {
      return {
        success: false,
        message: 'Échec restauration',
        error: (error as Error).message
      };
    }
  }

  /**
   * Liste les backups disponibles
   */
  listBackups(): BackupInfo[] {
    return this.loadManifest();
  }

  /**
   * Processus complet de self-update sécurisé
   * 1. Créer backup
   * 2. Appliquer les modifications (callback)
   * 3. Valider le build
   * 4. Si échec → rollback automatique
   */
  async safeUpdate(
    description: string,
    applyChanges: () => Promise<void>,
    filesToBackup?: string[]
  ): Promise<RollbackResult> {
    // 1. Créer backup
    const backupResult = await this.createBackup(description, filesToBackup || []);
    if (!backupResult.success) {
      return backupResult;
    }

    try {
      // 2. Appliquer les modifications
      console.log('[Rollback] Application des modifications...');
      await applyChanges();

      // 3. Valider le build
      const buildResult = await this.validateBuild();
      
      if (!buildResult.success) {
        console.log('[Rollback] Build échoué, rollback automatique...');
        
        // Rollback automatique
        const restoreResult = await this.restoreBackup(backupResult.backupId);
        
        // Recompiler après restauration
        await this.execCommand('npm run build');
        
        return {
          success: false,
          message: `Modifications annulées (build échoué): ${buildResult.error}`,
          error: buildResult.error,
          backupId: backupResult.backupId
        };
      }

      return {
        success: true,
        message: `Mise à jour réussie: ${description}`,
        backupId: backupResult.backupId
      };

    } catch (error) {
      console.log('[Rollback] Erreur, rollback automatique...');
      
      // Rollback automatique en cas d'erreur
      await this.restoreBackup(backupResult.backupId);
      await this.execCommand('npm run build');
      
      return {
        success: false,
        message: 'Erreur lors de la mise à jour, rollback effectué',
        error: (error as Error).message,
        backupId: backupResult.backupId
      };
    }
  }

  /**
   * Nettoie les vieux backups
   */
  async cleanup(): Promise<void> {
    const backups = this.loadManifest();
    
    while (backups.length > ROLLBACK.MAX_BACKUPS) {
      const oldBackup = backups.pop();
      if (oldBackup) {
        this.deleteBackup(oldBackup.id);
        console.log(`[Rollback] Backup supprimé: ${oldBackup.id}`);
      }
    }
    
    this.saveManifest(backups);
  }
}

// Instance globale
let rollbackManager: RollbackManager | null = null;

export function initRollbackManager(projectRoot: string): RollbackManager {
  rollbackManager = new RollbackManager(projectRoot);
  return rollbackManager;
}

export function getRollbackManager(): RollbackManager | null {
  return rollbackManager;
}
