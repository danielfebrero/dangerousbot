#!/usr/bin/env node

/**
 * DangerousBot - Setup CLI
 * Configure le démarrage automatique, crée un raccourci bureau,
 * et gère les clés API
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { exec } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOME = os.homedir();
const PLATFORM = os.platform();

// Chemins des clés API (correspondent à src/config.ts)
const SECRETS_DIR = path.join(HOME, '.dangerousbot', 'secrets');
const API_KEY_FILES = {
  anthropic: path.join(SECRETS_DIR, 'anthropic_api_key'),
  openrouter: path.join(SECRETS_DIR, 'openrouter_api_key'),
  mistral: path.join(SECRETS_DIR, 'mistral_api_key'),
  kimi: path.join(SECRETS_DIR, 'kimi_api_key'),
};

interface ApiKeyConfig {
  name: string;
  key: string;
  file: string;
  required: boolean;
  description: string;
}

// Couleurs
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function print(text: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

async function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// ============ API Keys Management ============

function ensureSecretsDir(): void {
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
    print(`✓ Dossier secrets créé: ${SECRETS_DIR}`, 'green');
  }
}

function loadApiKey(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim();
    }
  } catch (e) {
    // Ignore errors
  }
  return null;
}

function saveApiKey(filePath: string, apiKey: string): void {
  fs.writeFileSync(filePath, apiKey, { mode: 0o600 });
}

function getApiKeyStatus(): ApiKeyConfig[] {
  return [
    {
      name: 'Anthropic (Claude)',
      key: 'anthropic',
      file: API_KEY_FILES.anthropic,
      required: true,
      description: 'Pour Claude Opus/Sonnet - https://console.anthropic.com'
    },
    {
      name: 'OpenRouter',
      key: 'openrouter',
      file: API_KEY_FILES.openrouter,
      required: false,
      description: 'Pour embeddings Qwen et autres modèles - https://openrouter.ai'
    },
    {
      name: 'Mistral AI',
      key: 'mistral',
      file: API_KEY_FILES.mistral,
      required: false,
      description: 'Pour second regard et TTS - https://console.mistral.ai'
    },
    {
      name: 'Moonshot AI (Kimi)',
      key: 'kimi',
      file: API_KEY_FILES.kimi,
      required: false,
      description: 'Pour Kimi K2.5 - https://platform.moonshot.ai'
    }
  ];
}

async function configureApiKeys(rl: readline.Interface, force: boolean = false): Promise<void> {
  print('\n═══════════════════════════════════════════════════════════', 'cyan');
  print('              Configuration des clés API', 'bright');
  print('═══════════════════════════════════════════════════════════\n', 'cyan');

  ensureSecretsDir();

  const configs = getApiKeyStatus();

  for (const config of configs) {
    const existingKey = loadApiKey(config.file);
    const isConfigured = existingKey !== null && existingKey.length > 0;

    print(`${config.name}:`, 'bright');
    print(`  ${config.description}`, 'dim');
    
    if (isConfigured && !force) {
      const maskedKey = existingKey.substring(0, 8) + '...' + existingKey.substring(existingKey.length - 4);
      print(`  ✅ Configurée: ${maskedKey}`, 'green');
      
      const change = await askQuestion(rl, '  Modifier ? [o/N]: ');
      if (change.toLowerCase() !== 'o' && change.toLowerCase() !== 'oui') {
        print('');
        continue;
      }
    } else if (isConfigured && force) {
      print(`  📝 Actuelle: ${existingKey.substring(0, 8)}... (sera remplacée)`, 'yellow');
    } else {
      if (config.required) {
        print(`  ⚠️  REQUISE - DangerousBot ne fonctionnera pas sans`, 'red');
      } else {
        print(`  ℹ️  Optionnelle`, 'dim');
      }
    }

    const prompt = config.required 
      ? `  Entrez la clé API ${config.name}: `
      : `  Entrez la clé API ${config.name} (Entrée pour ignorer): `;
    
    const apiKey = await askQuestion(rl, prompt);

    if (apiKey.length > 0) {
      saveApiKey(config.file, apiKey);
      print(`  ✅ Clé sauvegardée\n`, 'green');
    } else if (config.required && !isConfigured) {
      print(`  ⚠️  Clé requise manquante !\n`, 'red');
    } else {
      print(`  ℹ️  Ignorée\n`, 'dim');
    }
  }

  print('═══════════════════════════════════════════════════════════\n', 'cyan');
}

async function verifyApiKeys(): Promise<boolean> {
  const configs = getApiKeyStatus();
  const missing: string[] = [];

  for (const config of configs) {
    const key = loadApiKey(config.file);
    if (!key && config.required) {
      missing.push(config.name);
    }
  }

  if (missing.length > 0) {
    print('\n⚠️  Clés API requises manquantes:', 'red');
    missing.forEach(name => print(`   - ${name}`, 'yellow'));
    return false;
  }

  return true;
}

// ============ macOS ============

function createMacOSApp(): string {
  // Créer un fichier .command simple dans le home directory
  const commandPath = path.join(HOME, 'dangerousbot.command');
  
  const commandScript = `#!/bin/bash
cd "${PROJECT_ROOT}"
./searxng.sh start 2>/dev/null || true
./start.sh
`;
  
  fs.writeFileSync(commandPath, commandScript);
  fs.chmodSync(commandPath, '755');

  return commandPath;
}

function createMacOSLaunchAgent(): string {
  const launchAgentsDir = path.join(HOME, 'Library', 'LaunchAgents');
  const plistPath = path.join(launchAgentsDir, 'com.dangerousbot.plist');

  if (!fs.existsSync(launchAgentsDir)) {
    fs.mkdirSync(launchAgentsDir, { recursive: true });
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dangerousbot</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>${PROJECT_ROOT}/dist/dangerousbot.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${HOME}/.dangerousbot/logs/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/.dangerousbot/logs/stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
</dict>
</plist>`;

  // Créer le dossier de logs
  fs.mkdirSync(path.join(HOME, '.dangerousbot', 'logs'), { recursive: true });

  fs.writeFileSync(plistPath, plist);

  // Charger le LaunchAgent
  exec(`launchctl load "${plistPath}"`, (error) => {
    if (error) {
      print(`Attention: Impossible de charger le LaunchAgent: ${error.message}`, 'yellow');
    }
  });

  return plistPath;
}

// ============ Linux ============

function createLinuxDesktopFile(): string {
  const desktopPath = path.join(HOME, 'Desktop', 'DangerousBot.desktop');

  const desktopEntry = `[Desktop Entry]
Name=DangerousBot
Comment=Programme IA Autonome
Exec=gnome-terminal -- bash -c "cd ${PROJECT_ROOT} && npm start; exec bash"
Icon=utilities-terminal
Terminal=false
Type=Application
Categories=Utility;Development;
`;

  fs.writeFileSync(desktopPath, desktopEntry);
  fs.chmodSync(desktopPath, '755');

  return desktopPath;
}

function createLinuxAutostart(): string {
  const autostartDir = path.join(HOME, '.config', 'autostart');
  const desktopPath = path.join(autostartDir, 'dangerousbot.desktop');

  if (!fs.existsSync(autostartDir)) {
    fs.mkdirSync(autostartDir, { recursive: true });
  }

  const desktopEntry = `[Desktop Entry]
Name=DangerousBot
Comment=Programme IA Autonome
Exec=node ${PROJECT_ROOT}/dist/dangerousbot.js
Terminal=false
Type=Application
X-GNOME-Autostart-enabled=true
`;

  fs.writeFileSync(desktopPath, desktopEntry);

  return desktopPath;
}

// ============ Windows ============

function createWindowsShortcut(): string {
  const desktopPath = path.join(HOME, 'Desktop', 'DangerousBot.bat');

  const batchScript = `@echo off
cd /d "${PROJECT_ROOT}"
npm start
pause
`;

  fs.writeFileSync(desktopPath, batchScript);

  return desktopPath;
}

function createWindowsAutostart(): string {
  const startupDir = path.join(HOME, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const batPath = path.join(startupDir, 'DangerousBot.bat');

  const batchScript = `@echo off
cd /d "${PROJECT_ROOT}"
start /min cmd /c "npm start"
`;

  fs.writeFileSync(batPath, batchScript);

  return batPath;
}

// ============ Main ============

async function showMenu(rl: readline.Interface): Promise<string> {
  print(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║           DangerousBot - Configuration                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`, 'cyan');

  print(`Plateforme détectée: ${PLATFORM}`, 'dim');
  print(`Projet: ${PROJECT_ROOT}\n`, 'dim');

  // Vérifier que le build existe
  const distPath = path.join(PROJECT_ROOT, 'dist', 'dangerousbot.js');
  if (!fs.existsSync(distPath)) {
    print('⚠️  Le projet n\'est pas encore compilé.', 'yellow');
    print('   Exécute d\'abord: npm run build\n', 'dim');
  }

  print('Que voulez-vous configurer ?\n', 'bright');
  print('  1. 🔑 Clés API (Anthropic, OpenRouter, Mistral, Kimi)', 'reset');
  print('  2. 🚀 Raccourci sur le Bureau', 'reset');
  print('  3. ⚡ Démarrage automatique au boot', 'reset');
  print('  4. 🛠️  Tout configurer', 'reset');
  print('  5. ❌ Quitter\n', 'reset');

  return await askQuestion(rl, 'Choix [1-5]: ');
}

async function main(): Promise<void> {
  console.clear();

  const rl = createReadlineInterface();
  
  // Vérifier d'abord si les clés API sont configurées
  const keysOk = await verifyApiKeys();
  
  if (!keysOk) {
    print('\nDes clés API requises sont manquantes.\n', 'yellow');
    const setupKeys = await askQuestion(rl, 'Voulez-vous les configurer maintenant ? [O/n]: ');
    
    if (setupKeys.toLowerCase() !== 'n' && setupKeys.toLowerCase() !== 'non') {
      await configureApiKeys(rl);
    }
  }

  const choice = await showMenu(rl);

  let shortcutPath: string | null = null;
  let autostartPath: string | null = null;

  try {
    switch (choice) {
      case '1':
        await configureApiKeys(rl, true);
        break;

      case '2':
      case '4':
        if (PLATFORM === 'darwin') {
          shortcutPath = createMacOSApp();
        } else if (PLATFORM === 'linux') {
          shortcutPath = createLinuxDesktopFile();
        } else if (PLATFORM === 'win32') {
          shortcutPath = createWindowsShortcut();
        }

        if (shortcutPath) {
          print(`\n✓ Raccourci créé: ${shortcutPath}`, 'green');
        }

        if (choice === '2') break;
        // Fall through for choice 4

      case '3':
        if (PLATFORM === 'darwin') {
          autostartPath = createMacOSLaunchAgent();
        } else if (PLATFORM === 'linux') {
          autostartPath = createLinuxAutostart();
        } else if (PLATFORM === 'win32') {
          autostartPath = createWindowsAutostart();
        }

        if (autostartPath) {
          print(`✓ Démarrage automatique configuré: ${autostartPath}`, 'green');
        }

        if (choice === '4') {
          // Option 4 = tout, donc on configure aussi les clés
          await configureApiKeys(rl);
        }
        break;

      case '5':
        print('\nConfiguration terminée.', 'dim');
        break;

      default:
        print('\nChoix invalide.', 'red');
    }
  } catch (error) {
    print(`\nErreur: ${(error as Error).message}`, 'red');
  }

  print('\n');
  rl.close();
}

// Mode "keys only" pour npm run setup:keys
async function keysOnlyMode(): Promise<void> {
  console.clear();
  const rl = createReadlineInterface();
  await configureApiKeys(rl, true);
  rl.close();
}

// Détecter le mode d'exécution
const args = process.argv.slice(2);
if (args.includes('--keys') || args.includes('-k')) {
  keysOnlyMode().catch(console.error);
} else {
  main().catch(console.error);
}
