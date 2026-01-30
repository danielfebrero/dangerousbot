"use strict";
/**
 * executor.ts - Exécution de code pour DangerousBot
 * Permet d'exécuter du code en mémoire ou via fichiers
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
exports.Executor = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vm = __importStar(require("vm"));
class Executor {
    workspacePath;
    constructor(workspacePath) {
        this.workspacePath = workspacePath;
        this.ensureWorkspace();
    }
    ensureWorkspace() {
        if (!fs.existsSync(this.workspacePath)) {
            fs.mkdirSync(this.workspacePath, { recursive: true });
        }
    }
    // Exécution JavaScript en mémoire (sandboxé)
    async executeInMemory(code, context = {}) {
        const logs = context.logs || [];
        const sandbox = {
            console: {
                log: (...args) => logs.push(['log', ...args]),
                error: (...args) => logs.push(['error', ...args]),
                warn: (...args) => logs.push(['warn', ...args])
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
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message, stack: err.stack };
        }
    }
    // Exécution via fichier (plus de permissions)
    async executeFile(filename, code, interpreter = 'node') {
        const filePath = path.join(this.workspacePath, filename);
        fs.writeFileSync(filePath, code);
        return new Promise((resolve) => {
            const child = (0, child_process_1.spawn)(interpreter, [filePath], {
                cwd: this.workspacePath,
                env: process.env
            });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            child.on('close', (code) => {
                resolve({
                    success: code === 0,
                    exitCode: code ?? -1,
                    stdout,
                    stderr,
                    filePath
                });
            });
            child.on('error', (error) => {
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
    async shell(command, options = {}) {
        return new Promise((resolve) => {
            (0, child_process_1.exec)(command, {
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
    writeFile(relativePath, content) {
        const fullPath = path.join(this.workspacePath, relativePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content);
        return fullPath;
    }
    // Lire un fichier
    readFile(relativePath) {
        const fullPath = path.join(this.workspacePath, relativePath);
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, 'utf-8');
        }
        return null;
    }
    // Lister les fichiers
    listFiles(relativePath = '') {
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
    deleteFile(relativePath) {
        const fullPath = path.join(this.workspacePath, relativePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return true;
        }
        return false;
    }
    getWorkspacePath() {
        return this.workspacePath;
    }
}
exports.Executor = Executor;
//# sourceMappingURL=executor.js.map