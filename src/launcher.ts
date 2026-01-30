#!/usr/bin/env node

/**
 * DangerousBot - Launcher avec réparation automatique
 * Démarre dangerousbot et répare automatiquement les erreurs de démarrage
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { ErrorAnalyzer } from './core/error-analyzer';
import { SecretsManager } from './core/secrets-manager';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
} as const;

type ColorKey = keyof typeof colors;

function print(text: string, color: ColorKey = 'reset'): void {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

function printLauncher(text: string, status: 'info' | 'error' | 'success' | 'warning' = 'info'): void {
  const statusColors = {
    info: 'cyan',
    error: 'red',
    success: 'green',
    warning: 'yellow'
  } as const;

  console.log(
    `${colors[statusColors[status]]}${colors.bright}[LAUNCHER]${colors.reset} ${text}`
  );
}

interface LaunchResult {
  success: boolean;
  process?: ChildProcess;
  error?: Error;
  attempts: number;
}

class DangerousBotLauncher {
  private maxAttempts = 3;
  private currentAttempt = 0;
  private process: ChildProcess | null = null;
  private errorBuffer: string[] = [];
  private baseDir = path.resolve(__dirname, '..');
  private analyzer: ErrorAnalyzer;

  constructor() {
    this.analyzer = new ErrorAnalyzer();
  }

  /**
   * Démarre dangerousbot et gère les erreurs
   */
  async launch(): Promise<LaunchResult> {
    printLauncher('Démarrage de DangerousBot...', 'info');

    // Vérifier que la clé API est disponible
    try {
      await SecretsManager.ensureApiKey();
      printLauncher('Clé API vérifiée.', 'success');
    } catch (error) {
      const err = error as Error;
      printLauncher(err.message, 'error');
      return {
        success: false,
        error: err,
        attempts: 0
      };
    }

    while (this.currentAttempt < this.maxAttempts) {
      this.currentAttempt++;
      printLauncher(`Tentative ${this.currentAttempt}/${this.maxAttempts}`, 'info');

      try {
        const result = await this.startProcess();

        if (result.success) {
          printLauncher('DangerousBot a démarré avec succès!', 'success');
          return {
            success: true,
            process: result.process,
            attempts: this.currentAttempt
          };
        }

        if (result.error && this.currentAttempt < this.maxAttempts) {
          printLauncher(`Erreur détectée: ${result.error.message}`, 'error');

          // Analyser et réparer l'erreur
          const repaired = await this.handleError(result.error);

          if (repaired) {
            printLauncher('Réparation appliquée. Nouvelle tentative...', 'warning');
            // Attendre un peu avant de relancer
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          } else {
            printLauncher(
              'Impossible de réparer l\'erreur automatiquement.',
              'error'
            );
            return {
              success: false,
              error: result.error,
              attempts: this.currentAttempt
            };
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        printLauncher(`Erreur critique: ${error.message}`, 'error');

        if (this.currentAttempt < this.maxAttempts) {
          const repaired = await this.handleError(error);
          if (!repaired) {
            return {
              success: false,
              error,
              attempts: this.currentAttempt
            };
          }
        }
      }
    }

    printLauncher(
      `Échec après ${this.maxAttempts} tentatives. Abandon.`,
      'error'
    );
    return {
      success: false,
      error: new Error(`Failed to start after ${this.maxAttempts} attempts`),
      attempts: this.currentAttempt
    };
  }

  /**
   * Démarre le processus dangerousbot
   */
  private startProcess(): Promise<{
    success: boolean;
    process?: ChildProcess;
    error?: Error;
  }> {
    return new Promise((resolve) => {
      try {
        // Vérifier que dist/start.js existe
        const startPath = path.join(this.baseDir, 'dist', 'start.js');
        if (!fs.existsSync(startPath)) {
          // Compiler si nécessaire
          printLauncher('Compilation du TypeScript...', 'info');
          const build = spawn('npm', ['run', 'build'], {
            cwd: this.baseDir,
            stdio: 'pipe'
          });

          let buildError = '';
          build.stderr?.on('data', (data) => {
            buildError += data.toString();
          });

          build.on('close', (code) => {
            if (code !== 0) {
              resolve({
                success: false,
                error: new Error(`Compilation failed: ${buildError}`)
              });
            } else {
              this.startProcessInternal(resolve);
            }
          });
        } else {
          this.startProcessInternal(resolve);
        }
      } catch (err) {
        resolve({
          success: false,
          error: err instanceof Error ? err : new Error(String(err))
        });
      }
    });
  }

  /**
   * Lance le processus Node.js
   */
  private startProcessInternal(
    resolve: (value: {
      success: boolean;
      process?: ChildProcess;
      error?: Error;
    }) => void
  ): void {
    const startPath = path.join(this.baseDir, 'dist', 'start.js');

    this.process = spawn('node', [startPath], {
      cwd: this.baseDir,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    this.errorBuffer = [];
    let isStarted = false;
    const timeout = setTimeout(() => {
      if (!isStarted) {
        isStarted = true;
        resolve({
          success: true,
          process: this.process || undefined
        });
      }
    }, 5000); // Considérer comme démarré après 5s

    this.process.stdout?.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(output);

      // Vérifier les signes que le démarrage s'est bien passé
      if (
        output.includes('listening') ||
        output.includes('started') ||
        output.includes('ready') ||
        output.includes('initialized')
      ) {
        if (!isStarted) {
          isStarted = true;
          clearTimeout(timeout);
          resolve({
            success: true,
            process: this.process || undefined
          });
        }
      }
    });

    this.process.stderr?.on('data', (data) => {
      const errorMsg = data.toString();
      process.stderr.write(errorMsg);
      this.errorBuffer.push(errorMsg);

      // Détecter les erreurs critiques
      if (
        errorMsg.includes('Error') ||
        errorMsg.includes('ENOENT') ||
        errorMsg.includes('Cannot find') ||
        errorMsg.includes('failed')
      ) {
        if (!isStarted) {
          isStarted = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            error: new Error(errorMsg.substring(0, 500))
          });
        }
      }
    });

    this.process.on('error', (err) => {
      if (!isStarted) {
        isStarted = true;
        clearTimeout(timeout);
        resolve({
          success: false,
          error: err
        });
      }
    });

    this.process.on('close', (code) => {
      if (!isStarted) {
        isStarted = true;
        clearTimeout(timeout);
      }

      if (code !== 0 && code !== null) {
        const errorMsg = this.errorBuffer.join('\n') || `Process exited with code ${code}`;
        resolve({
          success: false,
          error: new Error(errorMsg)
        });
      }
    });
  }

  /**
   * Gère une erreur en la faisant analyser par Opus et en appliquant une réparation
   */
  private async handleError(error: Error): Promise<boolean> {
    try {
      printLauncher('Analyse de l\'erreur avec Claude Opus 4.5...', 'info');

      const diagnosis = await this.analyzer.analyzeError(
        error.message,
        this.errorBuffer.join('\n'),
        this.baseDir
      );

      printLauncher(`Diagnostic: ${diagnosis.diagnosis}`, 'warning');

      if (diagnosis.repair) {
        printLauncher(`Application de la réparation: ${diagnosis.repair.description}`, 'info');
        const repaired = await this.applyRepair(diagnosis.repair);
        return repaired;
      }

      return false;
    } catch (err) {
      printLauncher(`Erreur lors de l'analyse: ${String(err)}`, 'error');
      return false;
    }
  }

  /**
   * Applique une réparation à la codebase
   */
  private async applyRepair(repair: {
    type: string;
    description: string;
    changes: Array<{
      file: string;
      action: 'create' | 'update' | 'delete';
      content?: string;
    }>;
  }): Promise<boolean> {
    try {
      for (const change of repair.changes) {
        const filePath = path.join(this.baseDir, change.file);

        if (change.action === 'create' || change.action === 'update') {
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          if (change.content) {
            fs.writeFileSync(filePath, change.content, 'utf8');
            printLauncher(`✓ Fichier modifié: ${change.file}`, 'success');
          }
        } else if (change.action === 'delete') {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            printLauncher(`✓ Fichier supprimé: ${change.file}`, 'success');
          }
        }
      }
      return true;
    } catch (err) {
      printLauncher(`Erreur lors de la réparation: ${String(err)}`, 'error');
      return false;
    }
  }

  /**
   * Arrête le processus courant
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

// Lancer l'application
async function main(): Promise<void> {
  const launcher = new DangerousBotLauncher();

  const result = await launcher.launch();

  if (result.success && result.process) {
    printLauncher('Application en cours d\'exécution. Appuyez sur Ctrl+C pour arrêter.', 'success');

    // Garder le process actif
    process.on('SIGINT', () => {
      printLauncher('Arrêt de l\'application...', 'warning');
      launcher.stop();
      process.exit(0);
    });
  } else {
    printLauncher('Impossible de démarrer DangerousBot.', 'error');
    console.error(result.error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});

export { DangerousBotLauncher };
