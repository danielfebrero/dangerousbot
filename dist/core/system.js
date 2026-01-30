"use strict";
/**
 * system.ts - Analyse de l'environnement pour DangerousBot
 * Permet de comprendre la machine sur laquelle il s'exécute
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.System = void 0;
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
class System {
    basePath;
    constructor(basePath) {
        this.basePath = basePath;
    }
    formatBytes(bytes) {
        const gb = bytes / (1024 * 1024 * 1024);
        return `${gb.toFixed(2)} GB`;
    }
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${mins}m`;
    }
    // Informations de base sur le système
    getBasicInfo() {
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
    checkTools() {
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
        const available = {};
        for (const tool of tools) {
            try {
                const cmd = os.platform() === 'win32' ? `where ${tool}` : `which ${tool}`;
                (0, child_process_1.execSync)(cmd, { stdio: 'pipe' });
                available[tool] = true;
            }
            catch {
                available[tool] = false;
            }
        }
        return available;
    }
    // Obtenir les variables d'environnement pertinentes (sans secrets)
    getSafeEnvVars() {
        const safeKeys = [
            'PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'LANG',
            'NODE_ENV', 'EDITOR', 'VISUAL'
        ];
        const env = {};
        for (const key of safeKeys) {
            if (process.env[key]) {
                env[key] = process.env[key];
            }
        }
        return env;
    }
    // Vérifier l'espace disque
    getDiskSpace() {
        try {
            if (os.platform() === 'darwin' || os.platform() === 'linux') {
                const output = (0, child_process_1.execSync)('df -h .', { cwd: this.basePath, encoding: 'utf-8' });
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
        }
        catch (e) {
            const err = e;
            return { error: err.message };
        }
        return null;
    }
    // Vérifier la connectivité réseau
    async checkNetwork() {
        const results = {
            internet: false,
            dns: false
        };
        try {
            const pingCmd = os.platform() === 'darwin'
                ? 'ping -c 1 -t 2 8.8.8.8'
                : 'ping -c 1 -W 2 8.8.8.8';
            (0, child_process_1.execSync)(pingCmd, { stdio: 'pipe' });
            results.internet = true;
        }
        catch {
            // Pas de connexion
        }
        try {
            const pingCmd = os.platform() === 'darwin'
                ? 'ping -c 1 -t 2 google.com'
                : 'ping -c 1 -W 2 google.com';
            (0, child_process_1.execSync)(pingCmd, { stdio: 'pipe' });
            results.dns = true;
        }
        catch {
            // DNS ne fonctionne pas
        }
        return results;
    }
    // Obtenir les processus en cours (top 10 par mémoire)
    getTopProcesses() {
        try {
            if (os.platform() === 'darwin') {
                return (0, child_process_1.execSync)('ps aux | head -11', { encoding: 'utf-8' });
            }
            else if (os.platform() === 'linux') {
                return (0, child_process_1.execSync)('ps aux --sort=-%mem | head -11', { encoding: 'utf-8' });
            }
        }
        catch {
            return null;
        }
        return null;
    }
    // Rapport complet de l'environnement
    async getFullReport() {
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
    async getSummary() {
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
exports.System = System;
//# sourceMappingURL=system.js.map