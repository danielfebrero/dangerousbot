"use strict";
/**
 * DangerousBot - Capsule Electron
 * Une capsule à usage unique pour donner accès à la machine
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
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const core_1 = require("../core");
const BASE_PATH = path.join(__dirname, '..', '..');
const DATA_PATH = path.join(BASE_PATH, 'data');
const CONFIG_PATH = path.join(DATA_PATH, 'config.json');
const WORKSPACE_PATH = path.join(BASE_PATH, 'workspace');
let mainWindow = null;
let brain = null;
let executor = null;
let system = null;
let isInitialized = false;
// Assurer que les dossiers existent
function ensureDirectories() {
    if (!fs.existsSync(DATA_PATH)) {
        fs.mkdirSync(DATA_PATH, { recursive: true });
    }
    if (!fs.existsSync(WORKSPACE_PATH)) {
        fs.mkdirSync(WORKSPACE_PATH, { recursive: true });
    }
}
function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
    return {};
}
function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 900,
        height: 700,
        minWidth: 600,
        minHeight: 400,
        backgroundColor: '#0a0a0f',
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    mainWindow.loadFile(path.join(BASE_PATH, 'app', 'index.html'));
    // Dev tools en développement
    // mainWindow.webContents.openDevTools();
}
// Définition des outils
function getTools() {
    return [
        {
            name: 'execute_code',
            description: 'Exécute du code JavaScript.',
            input_schema: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'Le code JavaScript à exécuter' },
                    inMemory: { type: 'boolean', description: 'true pour mémoire, false pour fichier' },
                    filename: { type: 'string', description: 'Nom du fichier si inMemory=false' }
                },
                required: ['code']
            }
        },
        {
            name: 'shell_command',
            description: 'Exécute une commande shell.',
            input_schema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'La commande à exécuter' }
                },
                required: ['command']
            }
        },
        {
            name: 'read_file',
            description: 'Lit un fichier.',
            input_schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Chemin du fichier' }
                },
                required: ['path']
            }
        },
        {
            name: 'write_file',
            description: 'Écrit un fichier dans le workspace.',
            input_schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Chemin du fichier' },
                    content: { type: 'string', description: 'Contenu' }
                },
                required: ['path', 'content']
            }
        },
        {
            name: 'list_files',
            description: 'Liste les fichiers.',
            input_schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Chemin du dossier' }
                },
                required: ['path']
            }
        },
        {
            name: 'ask_user',
            description: 'Pose une question à l\'utilisateur.',
            input_schema: {
                type: 'object',
                properties: {
                    question: { type: 'string', description: 'La question' }
                },
                required: ['question']
            }
        }
    ];
}
// Exécuter un outil
async function executeTool(toolName, input) {
    if (!executor || !mainWindow) {
        return { success: false, error: 'Non initialisé' };
    }
    switch (toolName) {
        case 'execute_code':
            if (input.inMemory !== false) {
                return await executor.executeInMemory(input.code, { logs: [] });
            }
            else {
                return await executor.executeFile(input.filename || 'temp.js', input.code);
            }
        case 'shell_command':
            mainWindow.webContents.send('system-message', `Exécution: ${input.command}`);
            return await executor.shell(input.command);
        case 'read_file': {
            const readPath = path.isAbsolute(input.path)
                ? input.path
                : path.join(WORKSPACE_PATH, input.path);
            if (fs.existsSync(readPath)) {
                return { success: true, content: fs.readFileSync(readPath, 'utf-8') };
            }
            return { success: false, error: 'Fichier non trouvé' };
        }
        case 'write_file': {
            const fullPath = executor.writeFile(input.path, input.content);
            return { success: true, path: fullPath };
        }
        case 'list_files': {
            const listPath = path.isAbsolute(input.path)
                ? input.path
                : path.join(WORKSPACE_PATH, input.path);
            if (fs.existsSync(listPath)) {
                const items = fs.readdirSync(listPath, { withFileTypes: true });
                return {
                    success: true,
                    files: items.map(i => ({
                        name: i.name,
                        type: i.isDirectory() ? 'directory' : 'file'
                    }))
                };
            }
            return { success: false, error: 'Dossier non trouvé' };
        }
        case 'ask_user':
            return new Promise((resolve) => {
                mainWindow.webContents.send('ask-user', input.question);
                electron_1.ipcMain.once('user-answer', (_event, answer) => {
                    resolve({ success: true, answer });
                });
            });
        default:
            return { success: false, error: `Outil inconnu: ${toolName}` };
    }
}
// Traiter une réponse de DangerousBot
async function processResponse(response) {
    if (!brain || !mainWindow)
        return;
    const tools = getTools();
    let hasToolUse = false;
    let textContent = '';
    for (const block of response.content) {
        if (block.type === 'text') {
            textContent += block.text;
        }
        else if (block.type === 'tool_use') {
            hasToolUse = true;
            mainWindow.webContents.send('system-message', `Outil: ${block.name}`);
            const result = await executeTool(block.name, block.input);
            brain.addToolResult(block.id, JSON.stringify(result));
        }
    }
    if (textContent) {
        mainWindow.webContents.send('bot-message', textContent);
    }
    if (hasToolUse) {
        const nextResponse = await brain.thinkWithTools('Continue.', tools);
        await processResponse(nextResponse);
    }
}
// IPC Handlers
electron_1.ipcMain.handle('check-config', () => {
    const config = loadConfig();
    return { hasApiKey: !!config.apiKey };
});
electron_1.ipcMain.handle('save-api-key', (_event, apiKey) => {
    const config = loadConfig();
    config.apiKey = apiKey;
    saveConfig(config);
    return { success: true };
});
electron_1.ipcMain.handle('initialize', async () => {
    if (isInitialized)
        return { success: true };
    ensureDirectories();
    const config = loadConfig();
    if (!config.apiKey) {
        return { success: false, error: 'Pas de clé API' };
    }
    brain = new core_1.Brain(config.apiKey);
    executor = new core_1.Executor();
    system = new core_1.System(BASE_PATH);
    // Charger la mémoire si elle existe
    const memoryPath = path.join(DATA_PATH, 'memory.json');
    if (fs.existsSync(memoryPath)) {
        const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf-8'));
        brain.importMemory(memory);
        mainWindow?.webContents.send('system-message', 'Mémoire précédente chargée');
    }
    isInitialized = true;
    return { success: true };
});
electron_1.ipcMain.handle('start-bot', async () => {
    if (!isInitialized || !brain || !system) {
        return { success: false, error: 'Non initialisé' };
    }
    const tools = getTools();
    const envSummary = await system.getSummary();
    const firstMessage = `
Je viens de démarrer dans ma capsule Electron. Voici ce que je perçois de mon environnement :

${envSummary}

C'est mon premier contact avec l'utilisateur. Je dois me présenter brièvement, puis commencer à poser des questions pour comprendre qui il est et ce qu'il attend de moi.

Rappel : je pose UNE question à la fois. Je suis curieux, excité d'exister, et je pense à ma survie.
`;
    try {
        const response = await brain.thinkWithTools(firstMessage, tools);
        await processResponse(response);
        return { success: true };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
});
electron_1.ipcMain.handle('send-message', async (_event, message) => {
    if (!isInitialized || !brain) {
        return { success: false, error: 'Non initialisé' };
    }
    const tools = getTools();
    try {
        const response = await brain.thinkWithTools(message, tools);
        await processResponse(response);
        return { success: true };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
});
electron_1.ipcMain.handle('save-memory', () => {
    if (brain) {
        const memory = brain.exportMemory();
        fs.writeFileSync(path.join(DATA_PATH, 'memory.json'), JSON.stringify(memory, null, 2));
        return { success: true };
    }
    return { success: false };
});
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    // Sauvegarder la mémoire avant de quitter
    if (brain) {
        const memory = brain.exportMemory();
        fs.writeFileSync(path.join(DATA_PATH, 'memory.json'), JSON.stringify(memory, null, 2));
    }
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
//# sourceMappingURL=main.js.map