/**
 * executor.ts - Exécution de code pour DangerousBot
 * Permet d'exécuter du code en mémoire ou via fichiers
 */

import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { ExecutionResult, FileInfo } from './types';

interface ExecutionContext {
  logs?: Array<[string, ...unknown[]]>;
  [key: string]: unknown;
}

export class Executor {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.ensureWorkspace();
  }

  private ensureWorkspace(): void {
    if (!fs.existsSync(this.workspacePath)) {
      fs.mkdirSync(this.workspacePath, { recursive: true });
    }
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
        cwd: () => this.workspacePath,
        platform: process.platform,
        arch: process.arch
      },
      __dirname: this.workspacePath,
      __filename: path.join(this.workspacePath, 'temp_execution.js'),
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

  // Exécution via fichier (plus de permissions)
  async executeFile(
    filename: string,
    code: string,
    interpreter: string = 'node'
  ): Promise<ExecutionResult> {
    const filePath = path.join(this.workspacePath, filename);

    fs.writeFileSync(filePath, code);

    return new Promise((resolve) => {
      const child = spawn(interpreter, [filePath], {
        cwd: this.workspacePath,
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

      child.on('close', (code: number | null) => {
        resolve({
          success: code === 0,
          exitCode: code ?? -1,
          stdout,
          stderr,
          filePath
        });
      });

      child.on('error', (error: Error) => {
        resolve({
          success: false,
          error: error.message,
          filePath
        });
      });

      // Timeout de 60 secondes
      setTimeout(() => {
        child.kill();
        resolve({
          success: false,
          error: 'Execution timeout (60s)',
          filePath
        });
      }, 60000);
    });
  }

  // Exécution de commande shell
  async shell(
    command: string,
    options: { cwd?: string; env?: Record<string, string>; timeout?: number } = {}
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      exec(command, {
        cwd: options.cwd || this.workspacePath,
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

  // Écrire un fichier
  writeFile(relativePath: string, content: string): string {
    const fullPath = path.join(this.workspacePath, relativePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content);
    return fullPath;
  }

  // Lire un fichier
  readFile(relativePath: string): string | null {
    const fullPath = path.join(this.workspacePath, relativePath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8');
    }
    return null;
  }

  // Lister les fichiers
  listFiles(relativePath: string = ''): FileInfo[] {
    const fullPath = path.join(this.workspacePath, relativePath);
    if (fs.existsSync(fullPath)) {
      return fs.readdirSync(fullPath, { withFileTypes: true }).map(dirent => ({
        name: dirent.name,
        isDirectory: dirent.isDirectory(),
        path: path.join(relativePath, dirent.name)
      }));
    }
    return [];
  }

  // Supprimer un fichier
  deleteFile(relativePath: string): boolean {
    const fullPath = path.join(this.workspacePath, relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  }

  getWorkspacePath(): string {
    return this.workspacePath;
  }
}
