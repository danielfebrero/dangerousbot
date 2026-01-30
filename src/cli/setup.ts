#!/usr/bin/env node

/**
 * DangerousBot - Setup CLI
 * Configure le démarrage automatique ou crée un raccourci bureau
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { exec } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOME = os.homedir();
const PLATFORM = os.platform();

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

// ============ macOS ============

function createMacOSApp(): string {
  const appPath = path.join(HOME, 'Desktop', 'DangerousBot.app');
  const contentsPath = path.join(appPath, 'Contents');
  const macOSPath = path.join(contentsPath, 'MacOS');
  const resourcesPath = path.join(contentsPath, 'Resources');

  // Créer la structure de l'app
  fs.mkdirSync(macOSPath, { recursive: true });
  fs.mkdirSync(resourcesPath, { recursive: true });

  // Info.plist
  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>launch</string>
  <key>CFBundleName</key>
  <string>DangerousBot</string>
  <key>CFBundleIdentifier</key>
  <string>com.dangerousbot.app</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>`;
  fs.writeFileSync(path.join(contentsPath, 'Info.plist'), infoPlist);

  // Script de lancement
  const launchScript = `#!/bin/bash
cd "${PROJECT_ROOT}"
open -a Terminal.app "${PROJECT_ROOT}/dist/dangerousbot.js" 2>/dev/null || \\
  osascript -e 'tell app "Terminal" to do script "cd \\"${PROJECT_ROOT}\\" && npm start"'
`;
  const launchPath = path.join(macOSPath, 'launch');
  fs.writeFileSync(launchPath, launchScript);
  fs.chmodSync(launchPath, '755');

  return appPath;
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

async function main(): Promise<void> {
  console.clear();
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

  const rl = createReadlineInterface();

  print('Comment voulez-vous configurer DangerousBot ?\n', 'bright');
  print('  1. Créer un raccourci sur le Bureau', 'reset');
  print('  2. Démarrage automatique au boot', 'reset');
  print('  3. Les deux', 'reset');
  print('  4. Aucun (annuler)\n', 'reset');

  const choice = await askQuestion(rl, 'Choix [1-4]: ');

  let shortcutPath: string | null = null;
  let autostartPath: string | null = null;

  try {
    switch (choice) {
      case '1':
      case '3':
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

        if (choice === '1') break;
        // Fall through for choice 3

      case '2':
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
        break;

      case '4':
        print('\nConfiguration annulée.', 'dim');
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

main().catch(console.error);
