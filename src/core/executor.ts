/**
 * Executor - Exécution de code et commandes pour DangerousBot
 */

import { spawn, exec } from 'child_process';
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

  // Exécution via fichier temporaire
  async executeFile(
    code: string,
    filename: string = 'temp.js',
    interpreter: string = 'node'
  ): Promise<ExecutionResult> {
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

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode: number | null) => {
        cleanup();
        resolve({
          success: exitCode === 0,
          exitCode: exitCode ?? -1,
          stdout,
          stderr
        });
      });

      child.on('error', (error: Error) => {
        cleanup();
        resolve({
          success: false,
          error: error.message
        });
      });

      // Timeout 60s
      setTimeout(() => {
        child.kill();
        cleanup();
        resolve({
          success: false,
          error: 'Execution timeout (60s)'
        });
      }, 60000);
    });
  }

  // Exécution de commande shell
  async shell(
    command: string,
    options: { cwd?: string; timeout?: number } = {}
  ): Promise<ExecutionResult> {
    const cwd = options.cwd ? this.resolvePath(options.cwd) : this.projectRoot;

    return new Promise((resolve) => {
      exec(command, {
        cwd,
        env: process.env,
        timeout: options.timeout || 60000,
        maxBuffer: 10 * 1024 * 1024
      }, (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout,
          stderr,
          error: error?.message,
          exitCode: error?.code as number | undefined
        });
      });
    });
  }

  // Lecture de fichier
  readFile(filePath: string): { success: boolean; content?: string; error?: string } {
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
