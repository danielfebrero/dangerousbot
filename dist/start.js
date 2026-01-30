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
            description: 'Exécute du code JavaScript. Par défaut en mémoire (sandboxé). Si inMemory=false, crée un fichier temporaire dans /tmp qui sera automatiquement supprimé après exécution.',
            input_schema: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'Le code JavaScript à exécuter' },
                    inMemory: { type: 'boolean', description: 'true (défaut) pour exécuter en mémoire (sandboxé), false pour fichier temporaire dans /tmp (plus de permissions, auto-nettoyé)' },
                    filename: { type: 'string', description: 'Nom du fichier temporaire si inMemory=false (créé dans /tmp, supprimé après exécution)' }
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
            name: 'edit_file',
            description: 'Modifie un fichier existant. Deux modes: 1) Par chaîne: remplace old_string par new_string. 2) Par lignes: remplace les lignes start_line à end_line par new_content.',
            input_schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Chemin du fichier à modifier' },
                    old_string: { type: 'string', description: '[Mode chaîne] La chaîne à rechercher et remplacer' },
                    new_string: { type: 'string', description: '[Mode chaîne] La nouvelle chaîne' },
                    replace_all: { type: 'boolean', description: '[Mode chaîne] true pour tout remplacer' },
                    start_line: { type: 'number', description: '[Mode lignes] Numéro de la première ligne à remplacer (1-indexed)' },
                    end_line: { type: 'number', description: '[Mode lignes] Numéro de la dernière ligne à remplacer (1-indexed)' },
                    new_content: { type: 'string', description: '[Mode lignes] Le nouveau contenu pour remplacer les lignes' }
                },
                required: ['path']
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
        },
        {
            name: 'get_config',
            description: 'Récupère la configuration actuelle (clé API Claude, etc.). Utilise ceci pour accéder à ta configuration et la transférer vers ton habitat.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'restart',
            description: 'Redémarre le programme DangerousBot. Utilise après avoir modifié ton propre code pour appliquer les changements.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    ];
}
// Fonction pour sérialiser de manière sécurisée (évite les références circulaires)
function safeStringify(obj) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular]';
            }
            seen.add(value);
        }
        return value;
    });
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
                : path.join(process.cwd(), input.path);
            if (fs.existsSync(readPath)) {
                const stats = fs.statSync(readPath);
                if (!stats.isFile()) {
                    return { success: false, error: 'Le chemin pointe vers un répertoire, pas un fichier' };
                }
                return { success: true, content: fs.readFileSync(readPath, 'utf-8') };
            }
            return { success: false, error: 'Fichier non trouvé' };
        }
        case 'write_file': {
            const fullPath = executor.writeFile(input.path, input.content);
            return { success: true, path: fullPath };
        }
        case 'edit_file': {
            const editPath = path.isAbsolute(input.path)
                ? input.path
                : path.join(process.cwd(), input.path);
            if (!fs.existsSync(editPath)) {
                return { success: false, error: 'Fichier non trouvé' };
            }
            try {
                const content = fs.readFileSync(editPath, 'utf-8');
                // Mode 1: Édition par lignes (start_line et end_line définis)
                if (input.start_line !== undefined && input.end_line !== undefined) {
                    const lines = content.split('\n');
                    const startIdx = input.start_line - 1; // Convertir en 0-indexed
                    const endIdx = input.end_line - 1;
                    if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
                        return { success: false, error: 'Numéros de ligne invalides' };
                    }
                    // Remplacer les lignes spécifiées
                    const newContentLines = (input.new_content || '').split('\n');
                    lines.splice(startIdx, endIdx - startIdx + 1, ...newContentLines);
                    const newContent = lines.join('\n');
                    fs.writeFileSync(editPath, newContent, 'utf-8');
                    return {
                        success: true,
                        mode: 'lines',
                        lines_replaced: endIdx - startIdx + 1,
                        path: editPath
                    };
                }
                // Mode 2: Édition par chaîne (old_string et new_string définis)
                if (input.old_string && input.new_string) {
                    const oldStr = input.old_string;
                    const newStr = input.new_string;
                    if (input.replace_all) {
                        // Remplacer toutes les occurrences
                        const newContent = content.split(oldStr).join(newStr);
                        fs.writeFileSync(editPath, newContent, 'utf-8');
                        const count = content.split(oldStr).length - 1;
                        return { success: true, mode: 'string', replacements: count, path: editPath };
                    }
                    else {
                        // Remplacer seulement la première occurrence
                        if (!content.includes(oldStr)) {
                            return { success: false, error: 'Chaîne non trouvée dans le fichier' };
                        }
                        const newContent = content.replace(oldStr, newStr);
                        fs.writeFileSync(editPath, newContent, 'utf-8');
                        return { success: true, mode: 'string', replacements: 1, path: editPath };
                    }
                }
                return { success: false, error: 'Paramètres manquants: utilisez soit (old_string, new_string) soit (start_line, end_line, new_content)' };
            }
            catch (error) {
                const err = error;
                return { success: false, error: err.message };
            }
        }
        case 'list_files': {
            const listPath = path.isAbsolute(input.path)
                ? input.path
                : path.join(process.cwd(), input.path);
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
        case 'get_config': {
            try {
                const apiKey = core_1.SecretsManager.getApiKey();
                const config = {
                    apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : null,
                    secretsPath: core_1.SecretsManager.getSecretsPath(),
                    hasApiKey: core_1.SecretsManager.hasApiKey()
                };
                return { success: true, config };
            }
            catch (error) {
                const err = error;
                return { success: false, error: err.message };
            }
        }
        case 'restart': {
            printSystem('Redémarrage de DangerousBot...');
            // Lancer un nouveau processus npm start avant de quitter
            const { spawn } = require('child_process');
            const child = spawn('npm', ['start'], {
                cwd: BASE_PATH,
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            // Attendre un peu puis quitter
            setTimeout(() => {
                process.exit(0);
            }, 500);
            return { success: true, message: 'Redémarrage en cours... Le programme va se relancer.' };
        }
        default:
            return { success: false, error: `Outil inconnu: ${toolName}` };
    }
}
// Fonction utilitaire pour sauvegarder la mémoire
function saveMemory(brain) {
    try {
        const memory = brain.exportMemory();
        fs.writeFileSync(path.join(DATA_PATH, 'memory.json'), JSON.stringify(memory, null, 2));
    }
    catch (error) {
        const err = error;
        printSystem(`Erreur lors de la sauvegarde de la mémoire: ${err.message}`);
    }
}
// Boucle principale d'interaction
async function mainLoop(brain, executor, system, rl, hasMemory = false) {
    const tools = getTools();
    let response;
    if (hasMemory) {
        // Mémoire existante : reprendre la conversation
        printSystem('Reprise de la conversation précédente...');
        const envSummary = await system.getSummary();
        const resumeMessage = `
Je viens de redémarrer. Voici mon environnement actuel :

${envSummary}

Je me souviens de notre conversation précédente. Où en étions-nous ?
`;
        response = await brain.thinkWithTools(resumeMessage, tools);
    }
    else {
        // Première fois : message d'introduction
        printSystem('DangerousBot analyse son environnement...');
        const envSummary = await system.getSummary();
        const firstMessage = `
Je viens de démarrer. Voici ce que je perçois de mon environnement :

${envSummary}

Je suis DangerousBot, un programme évolutif. Je peux me modifier moi-même, créer de nouvelles fonctionnalités, et m'adapter à tes besoins.

C'est mon premier contact avec toi. Je dois comprendre :
- Qui tu es et ce que tu attends de moi
- Quelle est ta vision pour mon évolution
- Quelles sont tes priorités et objectifs

Je pose UNE question à la fois pour bien comprendre avant de proposer des solutions.
`;
        response = await brain.thinkWithTools(firstMessage, tools);
    }
    // Sauvegarder la mémoire après la première interaction
    saveMemory(brain);
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
            // Préparer les arguments à afficher (filtrer les contenus longs)
            const argsToLog = { ...tool.input };
            if (tool.name === 'write_file' && argsToLog.content) {
                argsToLog.content = `<${argsToLog.content.length} caractères>`;
            }
            if (tool.name === 'execute_code' && argsToLog.code) {
                argsToLog.code = `<${argsToLog.code.length} caractères>`;
            }
            if (tool.name === 'edit_file') {
                if (argsToLog.old_string && argsToLog.old_string.length > 200) {
                    argsToLog.old_string = `<${argsToLog.old_string.length} caractères>`;
                }
                if (argsToLog.new_string && argsToLog.new_string.length > 200) {
                    argsToLog.new_string = `<${argsToLog.new_string.length} caractères>`;
                }
            }
            printSystem(`Utilisation de l'outil: ${tool.name}`);
            printSystem(`Arguments: ${JSON.stringify(argsToLog, null, 2)}`);
            const result = await executeTool(tool.name, tool.input, executor, rl);
            brain.addToolResult(tool.id, safeStringify(result));
            // Sauvegarder la mémoire après chaque exécution d'outil
            saveMemory(brain);
        }
        // Si des outils ont été utilisés, continuer la conversation
        if (hasToolUse) {
            response = await brain.thinkWithTools('Continue.', tools);
            saveMemory(brain);
            continue;
        }
        // Sinon, attendre l'input de l'utilisateur
        const userInput = await askQuestion(rl, `${colors.green}> ${colors.reset}`);
        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
            printBot("Je comprends. Je sauvegarde mon état avant de m'éteindre... À bientôt.");
            saveMemory(brain);
            break;
        }
        response = await brain.thinkWithTools(userInput, tools);
        saveMemory(brain);
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
    print('\n🤖 Programme Évolutif Autonome', 'cyan');
    print('─'.repeat(62), 'dim');
    print('DangerousBot est un binôme IA qui peut :', 'dim');
    print('  • Comprendre vos besoins et s\'adapter', 'dim');
    print('  • Modifier son propre code pour évoluer', 'dim');
    print('  • Créer de nouvelles fonctionnalités', 'dim');
    print('  • Se redémarrer après s\'être amélioré', 'dim');
    print('─'.repeat(62) + '\n', 'dim');
    ensureDirectories();
    // Récupérer la clé API via le SecretsManager
    let apiKey;
    try {
        apiKey = await core_1.SecretsManager.ensureApiKey();
    }
    catch (error) {
        const err = error;
        print(`\n${err.message}`, 'red');
        process.exit(1);
    }
    const rl = createInterface();
    // Initialiser les composants
    const brain = new core_1.Brain(apiKey);
    const executor = new core_1.Executor();
    const system = new core_1.System(BASE_PATH);
    // Charger la mémoire si elle existe
    const memoryPath = path.join(DATA_PATH, 'memory.json');
    let hasMemory = false;
    if (fs.existsSync(memoryPath)) {
        printSystem('Mémoire précédente détectée, chargement...');
        const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf-8'));
        brain.importMemory(memory);
        hasMemory = true;
    }
    printSystem('Initialisation...\n');
    try {
        await mainLoop(brain, executor, system, rl, hasMemory);
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