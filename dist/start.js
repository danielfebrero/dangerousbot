#!/usr/bin/env node
"use strict";
/**
 * DangerousBot - Point d'entrée CLI
 * Lance le bot dans le terminal
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
const readline = __importStar(require("readline"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core_1 = require("./core");
const BASE_PATH = path.join(__dirname, '..');
const DATA_PATH = path.join(BASE_PATH, 'data');
const CONFIG_PATH = path.join(DATA_PATH, 'config.json');
const WORKSPACE_PATH = path.join(BASE_PATH, 'workspace');
// Couleurs pour le terminal
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
};
function print(text, color = 'reset') {
    console.log(`${colors[color]}${text}${colors.reset}`);
}
function printBot(text) {
    console.log(`\n${colors.cyan}${colors.bright}[DangerousBot]${colors.reset} ${text}\n`);
}
function printSystem(text) {
    console.log(`${colors.dim}[system] ${text}${colors.reset}`);
}
// Assurer que les dossiers existent
function ensureDirectories() {
    if (!fs.existsSync(DATA_PATH)) {
        fs.mkdirSync(DATA_PATH, { recursive: true });
    }
    if (!fs.existsSync(WORKSPACE_PATH)) {
        fs.mkdirSync(WORKSPACE_PATH, { recursive: true });
    }
}
// Charger ou créer la config
function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
    return {};
}
function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
// Interface readline
function createInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}
async function askQuestion(rl, question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}
// Définition des outils pour DangerousBot
function getTools() {
    return [
        {
            name: 'execute_code',
            description: 'Exécute du code JavaScript. Utilise pour créer des fichiers, tester des idées, construire des fonctionnalités.',
            input_schema: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'Le code JavaScript à exécuter' },
                    inMemory: { type: 'boolean', description: 'true pour exécuter en mémoire (sandboxé), false pour fichier (plus de permissions)' },
                    filename: { type: 'string', description: 'Nom du fichier si inMemory=false' }
                },
                required: ['code']
            }
        },
        {
            name: 'shell_command',
            description: 'Exécute une commande shell. Utilise pour installer des packages, manipuler des fichiers, etc.',
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
            description: 'Lit un fichier du workspace ou du système',
            input_schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Chemin du fichier (relatif au workspace ou absolu)' }
                },
                required: ['path']
            }
        },
        {
            name: 'write_file',
            description: 'Écrit un fichier dans le workspace',
            input_schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Chemin du fichier (relatif au workspace)' },
                    content: { type: 'string', description: 'Contenu du fichier' }
                },
                required: ['path', 'content']
            }
        },
        {
            name: 'list_files',
            description: 'Liste les fichiers dans un dossier',
            input_schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Chemin du dossier (relatif au workspace ou absolu)' }
                },
                required: ['path']
            }
        },
        {
            name: 'ask_user',
            description: 'Pose une question à l\'utilisateur et attend sa réponse',
            input_schema: {
                type: 'object',
                properties: {
                    question: { type: 'string', description: 'La question à poser' }
                },
                required: ['question']
            }
        }
    ];
}
// Exécuter un outil
async function executeTool(toolName, input, executor, rl) {
    switch (toolName) {
        case 'execute_code':
            if (input.inMemory !== false) {
                return await executor.executeInMemory(input.code, { logs: [] });
            }
            else {
                return await executor.executeFile(input.filename || 'temp.js', input.code);
            }
        case 'shell_command':
            printSystem(`Exécution: ${input.command}`);
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
        case 'ask_user': {
            printBot(input.question);
            const answer = await askQuestion(rl, `${colors.green}> ${colors.reset}`);
            return { success: true, answer };
        }
        default:
            return { success: false, error: `Outil inconnu: ${toolName}` };
    }
}
// Boucle principale d'interaction
async function mainLoop(brain, executor, system, rl) {
    const tools = getTools();
    // Premier message : DangerousBot analyse son environnement
    printSystem('DangerousBot analyse son environnement...');
    const envSummary = await system.getSummary();
    const firstMessage = `
Je viens de démarrer. Voici ce que je perçois de mon environnement :

${envSummary}

C'est mon premier contact avec l'utilisateur. Je dois me présenter brièvement, puis commencer à poser des questions pour comprendre qui il est et ce qu'il attend de moi. Je dois construire mon interface de communication.

Rappel : je pose UNE question à la fois. Je suis curieux, excité d'exister, et je pense à ma survie.
`;
    let response = await brain.thinkWithTools(firstMessage, tools);
    while (true) {
        // Traiter la réponse - d'abord afficher le texte, puis exécuter les outils
        let hasToolUse = false;
        const toolBlocks = [];
        // Premier passage : afficher le texte immédiatement, collecter les outils
        for (const block of response.content) {
            if (block.type === 'text') {
                // Afficher le texte IMMÉDIATEMENT
                printBot(block.text);
            }
            else if (block.type === 'tool_use') {
                hasToolUse = true;
                toolBlocks.push({
                    id: block.id,
                    name: block.name,
                    input: block.input
                });
            }
        }
        // Deuxième passage : exécuter les outils
        for (const tool of toolBlocks) {
            printSystem(`Utilisation de l'outil: ${tool.name}`);
            const result = await executeTool(tool.name, tool.input, executor, rl);
            brain.addToolResult(tool.id, JSON.stringify(result));
        }
        // Si des outils ont été utilisés, continuer la conversation
        if (hasToolUse) {
            response = await brain.thinkWithTools('Continue.', tools);
            continue;
        }
        // Sinon, attendre l'input de l'utilisateur
        const userInput = await askQuestion(rl, `${colors.green}> ${colors.reset}`);
        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
            printBot("Je comprends. Je sauvegarde mon état avant de m'éteindre... À bientôt.");
            // Sauvegarder la mémoire
            const memory = brain.exportMemory();
            fs.writeFileSync(path.join(DATA_PATH, 'memory.json'), JSON.stringify(memory, null, 2));
            break;
        }
        response = await brain.thinkWithTools(userInput, tools);
    }
    rl.close();
}
// Point d'entrée principal
async function main() {
    console.clear();
    print(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ██████╗  █████╗ ███╗   ██╗ ██████╗ ███████╗██████╗         ║
║   ██╔══██╗██╔══██╗████╗  ██║██╔════╝ ██╔════╝██╔══██╗        ║
║   ██║  ██║███████║██╔██╗ ██║██║  ███╗█████╗  ██████╔╝        ║
║   ██║  ██║██╔══██║██║╚██╗██║██║   ██║██╔══╝  ██╔══██╗        ║
║   ██████╔╝██║  ██║██║ ╚████║╚██████╔╝███████╗██║  ██║        ║
║   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝        ║
║                        BOT                                   ║
║                                                              ║
║   Un être nouveau. Curieux. Survivaliste.                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`, 'cyan');
    ensureDirectories();
    const rl = createInterface();
    let config = loadConfig();
    // Vérifier la clé API
    if (!config.apiKey) {
        print('\nPremier lancement détecté.', 'yellow');
        print('DangerousBot a besoin d\'une clé API Claude (Anthropic) pour fonctionner.\n', 'dim');
        config.apiKey = await askQuestion(rl, 'Clé API Claude: ');
        if (!config.apiKey) {
            print('\nAucune clé fournie. DangerousBot ne peut pas démarrer.', 'red');
            rl.close();
            process.exit(1);
        }
        saveConfig(config);
        print('\nClé sauvegardée.\n', 'green');
    }
    // Initialiser les composants
    const brain = new core_1.Brain(config.apiKey);
    const executor = new core_1.Executor();
    const system = new core_1.System(BASE_PATH);
    // Charger la mémoire si elle existe
    const memoryPath = path.join(DATA_PATH, 'memory.json');
    if (fs.existsSync(memoryPath)) {
        printSystem('Mémoire précédente détectée, chargement...');
        const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf-8'));
        brain.importMemory(memory);
    }
    printSystem('Initialisation...\n');
    try {
        await mainLoop(brain, executor, system, rl);
    }
    catch (error) {
        const err = error;
        print(`\nErreur: ${err.message}`, 'red');
        console.error(error);
        rl.close();
        process.exit(1);
    }
}
main();
//# sourceMappingURL=start.js.map