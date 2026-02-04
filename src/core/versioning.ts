/**
 * Versioning - Gestion des versions automatiques pour DangerousBot
 */

import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { VersionInfo } from './types';

export class Versioning {
  private projectRoot: string;
  private versionFile: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.versionFile = path.join(projectRoot, 'data', 'version.json');
  }

  // Exécuter une commande git
  private async gitCommand(command: string): Promise<{ success: boolean; output?: string; error?: string }> {
    return new Promise((resolve) => {
      exec(`git ${command}`, { cwd: this.projectRoot }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: stderr || error.message });
        } else {
          resolve({ success: true, output: stdout.trim() });
        }
      });
    });
  }

  // Obtenir la version actuelle
  getCurrentVersion(): VersionInfo {
    try {
      if (fs.existsSync(this.versionFile)) {
        return JSON.parse(fs.readFileSync(this.versionFile, 'utf-8'));
      }
    } catch {
      // Ignore errors
    }

    return {
      version: '0.1.0',
      timestamp: new Date().toISOString()
    };
  }

  // Incrémenter la version
  private incrementVersion(current: string): string {
    const parts = current.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
  }

  // Sauvegarder la version
  private saveVersion(info: VersionInfo): void {
    const dir = path.dirname(this.versionFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.versionFile, JSON.stringify(info, null, 2));
  }

  // Mettre à jour la version dans package.json
  private updatePackageJson(newVersion: string): void {
    const pkgPath = path.join(this.projectRoot, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      pkg.version = newVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    } catch (e) {
      console.warn('[Versioning] Could not update package.json version:', e);
    }
  }

  // Vérifier si git est initialisé
  async isGitRepo(): Promise<boolean> {
    const result = await this.gitCommand('rev-parse --is-inside-work-tree');
    return result.success;
  }

  // Initialiser git si nécessaire
  async initGit(): Promise<{ success: boolean; error?: string }> {
    const isRepo = await this.isGitRepo();
    if (isRepo) {
      return { success: true };
    }

    const initResult = await this.gitCommand('init');
    if (!initResult.success) {
      return initResult;
    }

    // Créer .gitignore basique
    const gitignore = `node_modules/
dist/
.env
*.log
.DS_Store
`;
    fs.writeFileSync(path.join(this.projectRoot, '.gitignore'), gitignore);

    return { success: true };
  }

  // Versionner les changements
  async commitChanges(description: string): Promise<{ success: boolean; version?: string; commit?: string; error?: string }> {
    // S'assurer que git est initialisé
    const initResult = await this.initGit();
    if (!initResult.success) {
      return initResult;
    }

    // Ajouter tous les fichiers modifiés
    const addResult = await this.gitCommand('add -A');
    if (!addResult.success) {
      return addResult;
    }

    // Vérifier s'il y a des changements à committer
    const statusResult = await this.gitCommand('status --porcelain');
    if (!statusResult.output) {
      return { success: true, version: this.getCurrentVersion().version, commit: 'no-changes' };
    }

    // Incrémenter la version
    const currentVersion = this.getCurrentVersion();
    const newVersion = this.incrementVersion(currentVersion.version);

    // Mettre à jour package.json avec la nouvelle version
    this.updatePackageJson(newVersion);

    // Re-stage après la mise à jour de package.json
    await this.gitCommand('add -A');

    // Créer le commit
    const commitMessage = `DangerousBot v${newVersion} - ${description}`;
    const commitResult = await this.gitCommand(`commit -m "${commitMessage}"`);

    if (!commitResult.success) {
      return commitResult;
    }

    // Obtenir le hash du commit
    const hashResult = await this.gitCommand('rev-parse --short HEAD');
    const commitHash = hashResult.output || 'unknown';

    // Sauvegarder la nouvelle version
    const versionInfo: VersionInfo = {
      version: newVersion,
      commit: commitHash,
      timestamp: new Date().toISOString(),
      description
    };
    this.saveVersion(versionInfo);

    return {
      success: true,
      version: newVersion,
      commit: commitHash
    };
  }

  // Obtenir l'historique des commits récents
  async getRecentCommits(count: number = 10): Promise<string[]> {
    const result = await this.gitCommand(`log --oneline -n ${count}`);
    if (result.success && result.output) {
      return result.output.split('\n');
    }
    return [];
  }

  // Revenir à un commit précédent (dangereux!)
  async revertToCommit(commitHash: string): Promise<{ success: boolean; error?: string }> {
    return await this.gitCommand(`checkout ${commitHash} -- .`);
  }
}
