/**
 * system.ts - Analyse de l'environnement pour DangerousBot
 * Permet de comprendre la machine sur laquelle il s'exécute
 */

import * as os from 'os';
import { execSync } from 'child_process';
import * as fs from 'fs';
import {
  BasicSystemInfo,
  DiskSpace,
  NetworkStatus,
  ToolsAvailability,
  SystemReport
} from './types';

export class System {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  private formatBytes(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  }

  // Informations de base sur le système
  getBasicInfo(): BasicSystemInfo {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username,
      homeDir: os.homedir(),
      tmpDir: os.tmpdir(),
      cpus: os.cpus().length,
      totalMemory: this.formatBytes(os.totalmem()),
      freeMemory: this.formatBytes(os.freemem()),
      uptime: this.formatUptime(os.uptime()),
      nodeVersion: process.version,
      cwd: process.cwd()
    };
  }

  // Vérifier quels outils sont disponibles
  checkTools(): ToolsAvailability {
    const tools = [
      'node', 'npm', 'npx',
      'python', 'python3', 'pip', 'pip3',
      'git', 'curl', 'wget',
      'docker', 'brew', 'apt', 'yum',
      'code', 'vim', 'nano',
      'ffmpeg', 'imagemagick',
      'go', 'rustc', 'cargo',
      'java', 'javac',
      'ruby', 'gem',
      'php', 'composer'
    ];

    const available: ToolsAvailability = {};

    for (const tool of tools) {
      try {
        const cmd = os.platform() === 'win32' ? `where ${tool}` : `which ${tool}`;
        execSync(cmd, { stdio: 'pipe' });
        available[tool] = true;
      } catch {
        available[tool] = false;
      }
    }

    return available;
  }

  // Obtenir les variables d'environnement pertinentes (sans secrets)
  getSafeEnvVars(): Record<string, string> {
    const safeKeys = [
      'PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'LANG',
      'NODE_ENV', 'EDITOR', 'VISUAL'
    ];

    const env: Record<string, string> = {};
    for (const key of safeKeys) {
      if (process.env[key]) {
        env[key] = process.env[key]!;
      }
    }

    return env;
  }

  // Vérifier l'espace disque
  getDiskSpace(): DiskSpace | null {
    try {
      if (os.platform() === 'darwin' || os.platform() === 'linux') {
        const output = execSync('df -h .', { cwd: this.basePath, encoding: 'utf-8' });
        const lines = output.trim().split('\n');
        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          return {
            filesystem: parts[0],
            size: parts[1],
            used: parts[2],
            available: parts[3],
            usePercent: parts[4]
          };
        }
      }
    } catch (e) {
      const err = e as Error;
      return { error: err.message };
    }
    return null;
  }

  // Vérifier la connectivité réseau
  async checkNetwork(): Promise<NetworkStatus> {
    const results: NetworkStatus = {
      internet: false,
      dns: false
    };

    try {
      const pingCmd = os.platform() === 'darwin'
        ? 'ping -c 1 -t 2 8.8.8.8'
        : 'ping -c 1 -W 2 8.8.8.8';
      execSync(pingCmd, { stdio: 'pipe' });
      results.internet = true;
    } catch {
      // Pas de connexion
    }

    try {
      const pingCmd = os.platform() === 'darwin'
        ? 'ping -c 1 -t 2 google.com'
        : 'ping -c 1 -W 2 google.com';
      execSync(pingCmd, { stdio: 'pipe' });
      results.dns = true;
    } catch {
      // DNS ne fonctionne pas
    }

    return results;
  }

  // Obtenir les processus en cours (top 10 par mémoire)
  getTopProcesses(): string | null {
    try {
      if (os.platform() === 'darwin') {
        return execSync('ps aux | head -11', { encoding: 'utf-8' });
      } else if (os.platform() === 'linux') {
        return execSync('ps aux --sort=-%mem | head -11', { encoding: 'utf-8' });
      }
    } catch {
      return null;
    }
    return null;
  }

  // Rapport complet de l'environnement
  async getFullReport(): Promise<SystemReport> {
    return {
      basic: this.getBasicInfo(),
      tools: this.checkTools(),
      env: this.getSafeEnvVars(),
      disk: this.getDiskSpace(),
      network: await this.checkNetwork(),
      timestamp: new Date().toISOString()
    };
  }

  // Résumé textuel pour DangerousBot
  async getSummary(): Promise<string> {
    const report = await this.getFullReport();
    const tools = report.tools;
    const availableTools = Object.keys(tools).filter(t => tools[t]);
    const missingTools = Object.keys(tools).filter(t => !tools[t]);

    return `
## Environnement Système

**Machine**: ${report.basic.platform} (${report.basic.arch})
**Hostname**: ${report.basic.hostname}
**User**: ${report.basic.username}
**Home**: ${report.basic.homeDir}

**Ressources**:
- CPUs: ${report.basic.cpus}
- RAM totale: ${report.basic.totalMemory}
- RAM libre: ${report.basic.freeMemory}
- Uptime: ${report.basic.uptime}

**Stockage** (partition courante):
- Disponible: ${report.disk?.available || 'inconnu'}
- Utilisé: ${report.disk?.usePercent || 'inconnu'}

**Réseau**:
- Internet: ${report.network.internet ? 'OK' : 'NON'}
- DNS: ${report.network.dns ? 'OK' : 'NON'}

**Node.js**: ${report.basic.nodeVersion}

**Outils disponibles**: ${availableTools.join(', ')}

**Outils manquants**: ${missingTools.join(', ') || 'aucun'}
`.trim();
  }
}
