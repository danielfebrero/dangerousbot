"use strict";
/**
 * executor.ts - Exécution de code pour DangerousBot
 * Accès complet à la machine - pas de restrictions de workspace
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
const os = __importStar(require("os"));
const vm = __importStar(require("vm"));
class Executor {
    homePath;
    constructor() {
        this.homePath = os.homedir();
    }
    // Résoudre un chemin (absolu ou relatif au home)
    resolvePath(inputPath) {
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
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message, stack: err.stack };
        }
    }
    // Exécution via fichier - utilise /tmp par défaut et nettoie après
    async executeFile(filePath, code, interpreter = 'node') {
        // Si le chemin n'est pas absolu, utiliser /tmp au lieu du home
        let resolvedPath;
        if (path.isAbsolute(filePath)) {
            resolvedPath = filePath;
        }
        else {
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
                }
                catch (err) {
                    // Ignorer les erreurs de suppression
                }
            };
            const child = (0, child_process_1.spawn)(interpreter, [resolvedPath], {
                cwd: dir,
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
            child.on('close', (exitCode) => {
                cleanup();
                resolve({
                    success: exitCode === 0,
                    exitCode: exitCode ?? -1,
                    stdout,
                    stderr,
                    filePath: resolvedPath
                });
            });
            child.on('error', (error) => {
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
    async shell(command, options = {}) {
        const cwd = options.cwd ? this.resolvePath(options.cwd) : process.cwd();
        return new Promise((resolve) => {
            (0, child_process_1.exec)(command, {
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
    writeFile(filePath, content) {
        const resolvedPath = this.resolvePath(filePath);
        const dir = path.dirname(resolvedPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(resolvedPath, content);
        return resolvedPath;
    }
    // Lire un fichier - chemin absolu ou relatif au home
    readFile(filePath) {
        const resolvedPath = this.resolvePath(filePath);
        if (fs.existsSync(resolvedPath)) {
            return fs.readFileSync(resolvedPath, 'utf-8');
        }
        return null;
    }
    // Lister les fichiers - chemin absolu ou relatif au home
    listFiles(dirPath = '.') {
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
    deleteFile(filePath) {
        const resolvedPath = this.resolvePath(filePath);
        if (fs.existsSync(resolvedPath)) {
            fs.unlinkSync(resolvedPath);
            return true;
        }
        return false;
    }
    // Vérifier si un chemin existe
    exists(filePath) {
        return fs.existsSync(this.resolvePath(filePath));
    }
    // Obtenir des infos sur un fichier/dossier
    stat(filePath) {
        const resolvedPath = this.resolvePath(filePath);
        if (fs.existsSync(resolvedPath)) {
            return fs.statSync(resolvedPath);
        }
        return null;
    }
    // Créer un dossier
    mkdir(dirPath) {
        const resolvedPath = this.resolvePath(dirPath);
        if (!fs.existsSync(resolvedPath)) {
            fs.mkdirSync(resolvedPath, { recursive: true });
            return true;
        }
        return false;
    }
    // Copier un fichier
    copyFile(source, destination) {
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
    moveFile(source, destination) {
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
    getHomePath() {
        return this.homePath;
    }
}
exports.Executor = Executor;
//# sourceMappingURL=executor.js.map