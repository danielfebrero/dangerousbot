#!/usr/bin/env node

/**
 * DangerousBot - Setup API Keys Only
 * Configure uniquement les clés API
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

const HOME = os.homedir();

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

// Chemins des clés API
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

async function showStatus(): Promise<void> {
  print('\n═══════════════════════════════════════════════════════════', 'cyan');
  print('              Statut des clés API', 'bright');
  print('═══════════════════════════════════════════════════════════\n', 'cyan');

  const configs = getApiKeyStatus();

  for (const config of configs) {
    const existingKey = loadApiKey(config.file);
    const isConfigured = existingKey !== null && existingKey.length > 0;

    if (isConfigured) {
      const maskedKey = existingKey.substring(0, 8) + '...' + existingKey.substring(existingKey.length - 4);
      print(`${config.name}:`, 'bright');
      print(`  ✅ Configurée: ${maskedKey}`, 'green');
      print(`  📁 ${config.file}\n`, 'dim');
    } else {
      const status = config.required ? '❌ MANQUANTE' : '⚪ Non configurée';
      const color = config.required ? 'red' : 'dim';
      print(`${config.name}:`, 'bright');
      print(`  ${status}`, color);
      print(`  ℹ️  ${config.description}\n`, 'dim');
    }
  }

  print('═══════════════════════════════════════════════════════════\n', 'cyan');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--status') || args.includes('-s')) {
    await showStatus();
    return;
  }

  console.clear();
  const rl = createReadlineInterface();
  
  print(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║           DangerousBot - Configuration des clés API           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`, 'cyan');

  // Vérifier d'abord le statut
  const configs = getApiKeyStatus();
  const missingRequired = configs.filter(c => c.required && !loadApiKey(c.file));
  
  if (missingRequired.length > 0) {
    print('\n⚠️  Clés API requises manquantes:', 'red');
    missingRequired.forEach(c => print(`   - ${c.name}`, 'yellow'));
    print('');
  }

  const force = args.includes('--force') || args.includes('-f');
  await configureApiKeys(rl, force);
  
  // Afficher le statut final
  await showStatus();
  
  rl.close();
}

main().catch(console.error);
