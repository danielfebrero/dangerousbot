/**
 * Lifecycle - Gestion du cycle de vie de DangerousBot
 * Single instance, restart, compilation
 */

import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DANGEROUSBOT_DIR = path.join(os.homedir(), '.dangerousbot');
const LOCKFILE = path.join(DANGEROUSBOT_DIR, 'dangerousbot.lock');
const RESTART_SIGNAL = path.join(DANGEROUSBOT_DIR, '.restarted');

export class Lifecycle {
  private projectRoot: string;
  private isDev: boolean;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.isDev = process.env.NODE_ENV !== 'production';
  }

  // Assurer que le répertoire .dangerousbot existe
  private ensureDir(): void {
    if (!fs.existsSync(DANGEROUSBOT_DIR)) {
      fs.mkdirSync(DANGEROUSBOT_DIR, { recursive: true, mode: 0o700 });
    }
  }

  // Vérifier si une autre instance est en cours
  checkExistingInstance(): { running: boolean; pid?: number } {
    this.ensureDir();

    if (!fs.existsSync(LOCKFILE)) {
      return { running: false };
    }

    try {
      const content = fs.readFileSync(LOCKFILE, 'utf-8');
      const pid = parseInt(content.trim(), 10);

      // Vérifier si le processus existe
      try {
        process.kill(pid, 0); // Signal 0 = test d'existence
        return { running: true, pid };
      } catch {
        // Processus n'existe plus, supprimer le lockfile orphelin
        fs.unlinkSync(LOCKFILE);
        return { running: false };
      }
    } catch {
      return { running: false };
    }
  }

  // Tuer l'instance existante
  killExistingInstance(): boolean {
    const existing = this.checkExistingInstance();

    if (existing.running && existing.pid) {
      try {
        process.kill(existing.pid, 'SIGTERM');
        // Attendre un peu et forcer si nécessaire
        setTimeout(() => {
          try {
            process.kill(existing.pid!, 'SIGKILL');
          } catch {
            // Déjà mort
          }
        }, 2000);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  // Acquérir le lock (single instance)
  acquireLock(): boolean {
    this.ensureDir();

    // Tuer toute instance existante
    this.killExistingInstance();

    // Écrire notre PID
    try {
      fs.writeFileSync(LOCKFILE, process.pid.toString(), { mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }

  // Relâcher le lock
  releaseLock(): void {
    try {
      if (fs.existsSync(LOCKFILE)) {
        const content = fs.readFileSync(LOCKFILE, 'utf-8');
        if (parseInt(content.trim(), 10) === process.pid) {
          fs.unlinkSync(LOCKFILE);
        }
      }
    } catch {
      // Ignore
    }
  }

  // Compiler le projet
  async build(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      exec('npm run build', { cwd: this.projectRoot }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: stderr || error.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  // Marquer qu'un redémarrage a eu lieu
  markRestarted(reason: string): void {
    this.ensureDir();
    fs.writeFileSync(RESTART_SIGNAL, JSON.stringify({ 
      timestamp: Date.now(), 
      reason,
      version: process.version 
    }), { mode: 0o600 });
  }

  // Vérifier si on vient de redémarrer
  checkRestarted(): { restarted: boolean; reason?: string; timestamp?: number } {
    if (!fs.existsSync(RESTART_SIGNAL)) {
      return { restarted: false };
    }

    try {
      const content = fs.readFileSync(RESTART_SIGNAL, 'utf-8');
      const data = JSON.parse(content);
      
      // Si le redémarrage date de plus de 30 secondes, on considère que c'est un vieux signal
      if (Date.now() - data.timestamp > 30000) {
        fs.unlinkSync(RESTART_SIGNAL);
        return { restarted: false };
      }
      
      return { 
        restarted: true, 
        reason: data.reason,
        timestamp: data.timestamp 
      };
    } catch {
      return { restarted: false };
    }
  }

  // Effacer le signal de redémarrage
  clearRestarted(): void {
    try {
      if (fs.existsSync(RESTART_SIGNAL)) {
        fs.unlinkSync(RESTART_SIGNAL);
      }
    } catch {
      // Ignore
    }
  }

  // Redémarrer le serveur
  restart(reason: string = 'Manual restart'): void {
    console.log(`[Lifecycle] Redémarrage: ${reason}`);

    // Marquer le redémarrage
    this.markRestarted(reason);

    // Relâcher le lock
    this.releaseLock();

    if (this.isDev) {
      // En dev, on quitte simplement (nodemon recharge)
      console.log('[Lifecycle] Mode dev - arrêt pour rechargement manuel');
      process.exit(0);
    } else {
      // En prod, on lance une nouvelle instance avant de quitter
      const script = path.join(this.projectRoot, 'dist', 'dangerousbot.js');

      const child = spawn('node', [script], {
        cwd: this.projectRoot,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, NODE_ENV: 'production' }
      });

      child.unref();

      // Attendre un peu puis quitter
      setTimeout(() => {
        process.exit(0);
      }, 500);
    }
  }

  // Arrêter proprement
  shutdown(signal: string = 'SIGTERM'): void {
    console.log(`[Lifecycle] Arrêt reçu: ${signal}`);
    this.releaseLock();
    process.exit(0);
  }

  // Setup des handlers de signaux
  setupSignalHandlers(): void {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('exit', () => this.releaseLock());

    // Cleanup en cas d'erreur non gérée
    process.on('uncaughtException', (error) => {
      console.error('[Lifecycle] Uncaught exception:', error);
      this.releaseLock();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('[Lifecycle] Unhandled rejection:', reason);
    });
  }

  // Vérifier si on est en mode dev
  isDevMode(): boolean {
    return this.isDev;
  }

  // Obtenir le chemin du projet
  getProjectRoot(): string {
    return this.projectRoot;
  }
}
