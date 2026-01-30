/**
 * executor.ts - Exécution de code pour DangerousBot
 * Accès complet à la machine - pas de restrictions de workspace
 */

import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vm from 'vm';
import { ExecutionResult, FileInfo } from './types';

interface ExecutionContext {
  logs?: Array<[string, ...unknown[]]>;
  [key: string]: unknown;
}

export class Executor {
  private homePath: string;

  constructor() {
    this.homePath = os.homedir();
  }

  // Résoudre un chemin (absolu ou relatif au home)
  private resolvePath(inputPath: string): string {
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }
    // ~ expansion
    if (inputPath.startsWith('~/')) {
      return path.join(this.homePath, inputPath.slice(2));
    }
    // Chemin relatif -> relatif au home
    return path.join(this.homePath, inputPath);
  }

  // Exécution JavaScript en mémoire (sandboxé)
  async executeInMemory(code: string, context: ExecutionContext = {}): Promise<ExecutionResult> {
    const logs: Array<[string, ...unknown[]]> = context.logs || [];

    const sandbox = {
      console: {
        log: (...args: unknown[]) => logs.push(['log', ...args]),
        error: (...args: unknown[]) => logs.push(['error', ...args]),
        warn: (...args: unknown[]) => logs.push(['warn', ...args])
      },
      require,
      process: {
        env: process.env,
        cwd: () => process.cwd(),
        platform: process.platform,
        arch: process.arch
      },
      __dirname: process.cwd(),
      __filename: path.join(process.cwd(), 'temp_execution.js'),
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

  // Exécution via fichier - utilise /tmp par défaut et nettoie après
  async executeFile(
    filePath: string,
    code: string,
    interpreter: string = 'node'
  ): Promise<ExecutionResult> {
    // Si le chemin n'est pas absolu, utiliser /tmp au lieu du home
    let resolvedPath: string;
    if (path.isAbsolute(filePath)) {
      resolvedPath = filePath;
    } else {
      // Créer un nom de fichier unique dans /tmp
      const tempDir = os.tmpdir();
      resolvedPath = path.join(tempDir, filePath);
    }

    const dir = path.dirname(resolvedPath);

    // Créer le dossier si nécessaire
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, code);

    return new Promise((resolve) => {
      const cleanup = () => {
        // Supprimer le fichier temporaire
        try {
          if (fs.existsSync(resolvedPath)) {
            fs.unlinkSync(resolvedPath);
          }
        } catch (err) {
          // Ignorer les erreurs de suppression
        }
      };

      const child = spawn(interpreter, [resolvedPath], {
        cwd: dir,
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
          stderr,
          filePath: resolvedPath
        });
      });

      child.on('error', (error: Error) => {
        cleanup();
        resolve({
          success: false,
          error: error.message,
          filePath: resolvedPath
        });
      });

      // Timeout de 60 secondes
      setTimeout(() => {
        child.kill();
        cleanup();
        resolve({
          success: false,
          error: 'Execution timeout (60s)',
          filePath: resolvedPath
        });
      }, 60000);
    });
  }

  // Exécution de commande shell - cwd optionnel
  async shell(
    command: string,
    options: { cwd?: string; env?: Record<string, string>; timeout?: number } = {}
  ): Promise<ExecutionResult> {
    const cwd = options.cwd ? this.resolvePath(options.cwd) : process.cwd();

    return new Promise((resolve) => {
      exec(command, {
        cwd,
        env: { ...process.env, ...options.env },
        timeout: options.timeout || 60000,
        maxBuffer: 10 * 1024 * 1024
      }, (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout,
          stderr,
          error: error?.message
        });
      });
    });
  }

  // Écrire un fichier - chemin absolu ou relatif au home
  writeFile(filePath: string, content: string): string {
    const resolvedPath = this.resolvePath(filePath);
    const dir = path.dirname(resolvedPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, content);
    return resolvedPath;
  }

  // Lire un fichier - chemin absolu ou relatif au home
  readFile(filePath: string): string | null {
    const resolvedPath = this.resolvePath(filePath);
    if (fs.existsSync(resolvedPath)) {
      return fs.readFileSync(resolvedPath, 'utf-8');
    }
    return null;
  }

  // Lister les fichiers - chemin absolu ou relatif au home
  listFiles(dirPath: string = '.'): FileInfo[] {
    const resolvedPath = this.resolvePath(dirPath);
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      return fs.readdirSync(resolvedPath, { withFileTypes: true }).map(dirent => ({
        name: dirent.name,
        isDirectory: dirent.isDirectory(),
        path: path.join(resolvedPath, dirent.name)
      }));
    }
    return [];
  }

  // Supprimer un fichier - chemin absolu ou relatif au home
  deleteFile(filePath: string): boolean {
    const resolvedPath = this.resolvePath(filePath);
    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
      return true;
    }
    return false;
  }

  // Vérifier si un chemin existe
  exists(filePath: string): boolean {
    return fs.existsSync(this.resolvePath(filePath));
  }

  // Obtenir des infos sur un fichier/dossier
  stat(filePath: string): fs.Stats | null {
    const resolvedPath = this.resolvePath(filePath);
    if (fs.existsSync(resolvedPath)) {
      return fs.statSync(resolvedPath);
    }
    return null;
  }

  // Créer un dossier
  mkdir(dirPath: string): boolean {
    const resolvedPath = this.resolvePath(dirPath);
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
      return true;
    }
    return false;
  }

  // Copier un fichier
  copyFile(source: string, destination: string): boolean {
    const srcPath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);

    if (fs.existsSync(srcPath)) {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
      return true;
    }
    return false;
  }

  // Déplacer/renommer un fichier
  moveFile(source: string, destination: string): boolean {
    const srcPath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);

    if (fs.existsSync(srcPath)) {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.renameSync(srcPath, destPath);
      return true;
    }
    return false;
  }

  getHomePath(): string {
    return this.homePath;
  }
}
