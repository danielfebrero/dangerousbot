/**
 * Executor - Exécution de code et commandes pour DangerousBot
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vm from 'vm';
import { ExecutionResult } from './types';

interface ExecutionContext {
  logs?: Array<[string, ...unknown[]]>;
  [key: string]: unknown;
}

export class Executor {
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  // Résoudre un chemin (absolu, ~, ou relatif au projet)
  resolvePath(inputPath: string): string {
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }
    if (inputPath.startsWith('~/')) {
      return path.join(os.homedir(), inputPath.slice(2));
    }
    return path.join(this.projectRoot, inputPath);
  }

  // Exécution JavaScript sandboxée en mémoire
  async executeInMemory(code: string, context: ExecutionContext = {}): Promise<ExecutionResult> {
    const logs: Array<[string, ...unknown[]]> = context.logs || [];

    const sandbox = {
      console: {
        log: (...args: unknown[]) => logs.push(['log', ...args]),
        error: (...args: unknown[]) => logs.push(['error', ...args]),
        warn: (...args: unknown[]) => logs.push(['warn', ...args]),
        info: (...args: unknown[]) => logs.push(['info', ...args])
      },
      require,
      process: {
        env: process.env,
        cwd: () => this.projectRoot,
        platform: process.platform,
        arch: process.arch
      },
      __dirname: this.projectRoot,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      Buffer,
      ...context
    };

    try {
      const script = new vm.Script(code);
      const result = script.runInNewContext(sandbox, {
        timeout: 30000,
        displayErrors: true
      });
      return { success: true, result, logs };
    } catch (error) {
      const err = error as Error;
      return { success: false, error: err.message, stack: err.stack };
    }
  }

  // Exécution via fichier temporaire avec support de l'annulation
  async executeFile(
    code: string,
    filename: string = 'temp.js',
    interpreter: string = 'node',
    options: { timeout?: number; signal?: AbortSignal } = {}
  ): Promise<ExecutionResult> {
    const timeout = options.timeout ?? 60000;
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `dangerousbot_${Date.now()}_${filename}`);

    fs.writeFileSync(filePath, code);

    return new Promise((resolve) => {
      const cleanup = () => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // Ignore cleanup errors
        }
      };

      const child = spawn(interpreter, [filePath], {
        cwd: this.projectRoot,
        env: process.env
      });

      let stdout = '';
      let stderr = '';
      let isResolved = false;

      const resolveOnce = (result: ExecutionResult) => {
        if (!isResolved) {
          isResolved = true;
          resolve(result);
        }
      };

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode: number | null, signal: string | null) => {
        cleanup();
        if (signal) {
          resolveOnce({
            success: false,
            exitCode: undefined,
            stdout,
            stderr,
            error: `Exécution annulée (signal: ${signal})`
          });
          return;
        }
        resolveOnce({
          success: exitCode === 0,
          exitCode: exitCode ?? -1,
          stdout,
          stderr
        });
      });

      child.on('error', (error: Error) => {
        cleanup();
        resolveOnce({
          success: false,
          error: error.message
        });
      });

      // Timeout
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
        cleanup();
        resolveOnce({
          success: false,
          error: `Execution timeout (${timeout / 1000}s)`
        });
      }, timeout);

      // Gestion du signal d'annulation (AbortSignal)
      if (options.signal) {
        const onAbort = () => {
          clearTimeout(timeoutId);
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 2000);
          resolveOnce({
            success: false,
            stdout,
            stderr,
            error: 'Exécution annulée par l\'utilisateur'
          });
        };

        if (options.signal.aborted) {
          onAbort();
        } else {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }

        // Cleanup listener quand le processus termine
        child.on('close', () => {
          options.signal?.removeEventListener('abort', onAbort);
          clearTimeout(timeoutId);
          cleanup();
        });
      } else {
        child.on('close', () => {
          clearTimeout(timeoutId);
          cleanup();
        });
      }
    });
  }

  // Exécution de commande shell avec support de l'annulation
  async shell(
    command: string,
    options: { cwd?: string; timeout?: number; signal?: AbortSignal } = {}
  ): Promise<ExecutionResult> {
    const cwd = options.cwd ? this.resolvePath(options.cwd) : this.projectRoot;
    const timeout = options.timeout || 60000;

    return new Promise((resolve) => {
      // Utiliser spawn au lieu de exec pour supporter l'annulation
      // exec utilise un buffer limité, spawn permet le streaming
      const child = spawn('sh', ['-c', command], {
        cwd,
        env: process.env,
        shell: false // On utilise explicitement sh -c
      });

      let stdout = '';
      let stderr = '';
      let isResolved = false;

      const resolveOnce = (result: ExecutionResult) => {
        if (!isResolved) {
          isResolved = true;
          resolve(result);
        }
      };

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode: number | null, signal: string | null) => {
        // Si terminé par un signal (comme SIGTERM), c'est une annulation
        if (signal) {
          resolveOnce({
            success: false,
            stdout,
            stderr,
            error: `Commande annulée (signal: ${signal})`,
            exitCode: undefined
          });
          return;
        }
        resolveOnce({
          success: exitCode === 0,
          stdout,
          stderr,
          error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
          exitCode: exitCode ?? -1
        });
      });

      child.on('error', (error: Error) => {
        resolveOnce({
          success: false,
          stdout,
          stderr,
          error: error.message
        });
      });

      // Gestion du timeout
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
        resolveOnce({
          success: false,
          stdout,
          stderr,
          error: `Execution timeout (${timeout / 1000}s)`
        });
      }, timeout);

      // Gestion du signal d'annulation (AbortSignal)
      if (options.signal) {
        const onAbort = () => {
          clearTimeout(timeoutId);
          child.kill('SIGTERM');
          // Force kill après 2s si pas terminé
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 2000);
          resolveOnce({
            success: false,
            stdout,
            stderr,
            error: 'Commande annulée par l\'utilisateur',
            exitCode: undefined
          });
        };

        if (options.signal.aborted) {
          onAbort();
        } else {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }

        // Cleanup listener quand le processus termine
        child.on('close', () => {
          options.signal?.removeEventListener('abort', onAbort);
          clearTimeout(timeoutId);
        });
      } else {
        child.on('close', () => {
          clearTimeout(timeoutId);
        });
      }
    });
  }

  // Lecture de fichier
  readFile(filePath: string, offset?: number, limit?: number): { success: boolean; content?: string; total_lines?: number; start_line?: number; end_line?: number; error?: string } {
    const resolved = this.resolvePath(filePath);
    try {
      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'Fichier non trouvé' };
      }
      const stats = fs.statSync(resolved);
      if (stats.isDirectory()) {
        return { success: false, error: 'Le chemin pointe vers un répertoire' };
      }
      const content = fs.readFileSync(resolved, 'utf-8');
      
      // Si offset ou limit spécifié, traiter le contenu ligne par ligne
      if (offset !== undefined || limit !== undefined) {
        const lines = content.split('\n');
        const totalLines = lines.length;
        const startLine = Math.max(0, (offset ?? 1) - 1); // Convertir 1-indexed à 0-indexed
        const endLine = limit !== undefined 
          ? Math.min(startLine + limit, totalLines)
          : totalLines;
        
        const selectedLines = lines.slice(startLine, endLine);
        const result = selectedLines.join('\n');
        
        return { 
          success: true, 
          content: result,
          total_lines: totalLines,
          start_line: startLine + 1,
          end_line: endLine
        };
      }
      
      return { success: true, content };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Lecture d'image en base64 pour les modèles multimodaux
  readImage(filePath: string): { success: boolean; data?: string; media_type?: string; error?: string } {
    const resolved = this.resolvePath(filePath);
    try {
      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'Fichier non trouvé' };
      }
      const stats = fs.statSync(resolved);
      if (stats.isDirectory()) {
        return { success: false, error: 'Le chemin pointe vers un répertoire' };
      }

      // Lire le fichier en buffer
      const buffer = fs.readFileSync(resolved);
      
      // Détecter le type MIME
      const ext = path.extname(resolved).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml'
      };
      
      const mediaType = mimeTypes[ext];
      if (!mediaType) {
        return { success: false, error: `Format d'image non supporté: ${ext}. Formats supportés: png, jpg, jpeg, gif, webp, bmp, svg` };
      }

      // Convertir en base64
      const base64Data = buffer.toString('base64');
      
      return { 
        success: true, 
        data: base64Data,
        media_type: mediaType
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Écriture de fichier
  writeFile(filePath: string, content: string): { success: boolean; path?: string; error?: string } {
    const resolved = this.resolvePath(filePath);
    try {
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(resolved, content, 'utf-8');
      return { success: true, path: resolved };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Liste des fichiers
  listFiles(dirPath: string): { success: boolean; files?: Array<{ name: string; type: string }>; error?: string } {
    const resolved = this.resolvePath(dirPath);
    try {
      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'Répertoire non trouvé' };
      }
      const items = fs.readdirSync(resolved, { withFileTypes: true });
      const files = items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file'
      }));
      return { success: true, files };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Édition de fichier
  editFile(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll: boolean = false
  ): { success: boolean; replacements?: number; error?: string } {
    const resolved = this.resolvePath(filePath);
    try {
      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'Fichier non trouvé' };
      }
      let content = fs.readFileSync(resolved, 'utf-8');

      if (!content.includes(oldString)) {
        return { success: false, error: 'Chaîne non trouvée dans le fichier' };
      }

      let replacements = 0;
      if (replaceAll) {
        const parts = content.split(oldString);
        replacements = parts.length - 1;
        content = parts.join(newString);
      } else {
        content = content.replace(oldString, newString);
        replacements = 1;
      }

      fs.writeFileSync(resolved, content, 'utf-8');
      return { success: true, replacements };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Suppression de fichier
  deleteFile(filePath: string): { success: boolean; error?: string } {
    const resolved = this.resolvePath(filePath);
    try {
      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'Fichier non trouvé' };
      }
      fs.unlinkSync(resolved);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Création de répertoire
  mkdir(dirPath: string): { success: boolean; path?: string; error?: string } {
    const resolved = this.resolvePath(dirPath);
    try {
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }
      return { success: true, path: resolved };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Vérifier si un chemin existe
  exists(filePath: string): boolean {
    return fs.existsSync(this.resolvePath(filePath));
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  setProjectRoot(root: string): void {
    this.projectRoot = root;
  }
}
