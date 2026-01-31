/**
 * Configuration centrale de DangerousBot
 * Toutes les valeurs configurables sont ici.
 */

import * as path from 'path';
import * as os from 'os';

// ============================================================================
// PROVIDER ACTIF (hot-swappable)
// ============================================================================

export type ProviderType = 'claude' | 'kimi';

export const PROVIDER = {
  /** Provider actif ('claude' ou 'kimi') - modifiable à chaud */
  ACTIVE: 'kimi' as ProviderType,
} as const;

// ============================================================================
// MODÈLES IA
// ============================================================================

export const MODELS = {
  /** Modèle principal pour le cerveau (Opus 4.5 = le plus intelligent) */
  BRAIN: 'claude-opus-4-5-20251101',
  
  /** Modèle pour la compression/résumés (Sonnet 4.5 = rapide et efficace) */
  COMPRESSOR: 'claude-sonnet-4-5-20250929',
  
  /** Modèle pour les embeddings (via OpenRouter) */
  EMBEDDING: 'qwen/qwen3-embedding-8b',
  
  /** Modèles Mistral (second regard) */
  MISTRAL_LARGE: 'mistral-large-2411',      // Complexe: architecture, sécurité, review critique
  MISTRAL_MEDIUM: 'mistral-medium-2505',    // Équilibré: brainstorming, validation
  MISTRAL_SMALL: 'mistral-small-2503',      // Rapide: tâches simples, formatting
  
  /** Modèles Kimi (Moonshot) */
  KIMI_DEFAULT: 'kimi-k2.5',                // Kimi 2.5 - modèle par défaut
  KIMI_LONG: 'kimi-k2.5',                   // Kimi 2.5 (supporte jusqu'à 128k)
} as const;

// ============================================================================
// TOKENS & LIMITES
// ============================================================================

export const TOKENS = {
  /** Max tokens pour les réponses du brain */
  MAX_RESPONSE: 8096,
  
  /** Max tokens pour les résumés de compression */
  MAX_COMPRESSION_SUMMARY: 1024,
  
  /** Max tokens pour les réponses Mistral */
  MAX_MISTRAL_RESPONSE: 2048,
} as const;

// ============================================================================
// MÉMOIRE & COMPRESSION
// ============================================================================

export const MEMORY = {
  /** Nombre de messages avant de déclencher la compression */
  COMPRESSION_THRESHOLD: 30,
  
  /** Nombre de messages récents à garder intacts lors de la compression */
  KEEP_RECENT_MESSAGES: 10,
  
  /** Vérifier la compression tous les N messages */
  COMPRESSION_CHECK_INTERVAL: 20,
  
  /** Nombre minimum de messages pour justifier une compression */
  MIN_MESSAGES_TO_COMPRESS: 10,
  
  /** Nombre de mémoires pertinentes à récupérer par recherche sémantique */
  RELEVANT_MEMORIES_TOP_K: 3,
} as const;

// ============================================================================
// SERVEUR
// ============================================================================

export const SERVER = {
  /** Port par défaut */
  DEFAULT_PORT: 3000,
  
  /** Host par défaut */
  DEFAULT_HOST: 'localhost',
} as const;

// ============================================================================
// ROLLBACK & SÉCURITÉ
// ============================================================================

export const ROLLBACK = {
  /** Nombre maximum de backups à conserver */
  MAX_BACKUPS: 10,
  
  /** Dossier de stockage des backups */
  BACKUP_DIR: '.backups',
  
  /** Timeout pour le build (ms) */
  BUILD_TIMEOUT: 120000,
  
  /** Nombre de tentatives pour le health check */
  HEALTH_CHECK_RETRIES: 5,
  
  /** Intervalle entre les health checks (ms) */
  HEALTH_CHECK_INTERVAL: 2000,
} as const;

// ============================================================================
// CHEMINS
// ============================================================================

export const PATHS = {
  /** Répertoire de configuration DangerousBot */
  CONFIG_DIR: path.join(os.homedir(), '.dangerousbot'),
  
  /** Répertoire des secrets (clés API) */
  get SECRETS_DIR() { return path.join(this.CONFIG_DIR, 'secrets'); },
  
  /** Fichier de clé API Anthropic */
  get ANTHROPIC_KEY_FILE() { return path.join(this.SECRETS_DIR, 'anthropic_api_key'); },
  
  /** Fichier de clé API OpenRouter */
  get OPENROUTER_KEY_FILE() { return path.join(this.SECRETS_DIR, 'openrouter_api_key'); },
  
  /** Fichier de clé API Mistral */
  get MISTRAL_KEY_FILE() { return path.join(this.SECRETS_DIR, 'mistral_api_key'); },
  
  /** Fichier de clé API Kimi (Moonshot) */
  get KIMI_KEY_FILE() { return path.join(this.SECRETS_DIR, 'kimi_api_key'); },
  
  /** Fichier pour l'ID utilisateur Telegram */
  get TELEGRAM_USER_ID_FILE() { return path.join(this.CONFIG_DIR, 'telegram.user'); },
  
  /** Fichier pour le token API Telegram Bot */
  get TELEGRAM_BOT_TOKEN_FILE() { return path.join(this.SECRETS_DIR, 'telegram_bot_token'); },
} as const;

// ============================================================================
// API EXTERNES
// ============================================================================

export const APIS = {
  /** URL de l'API OpenRouter pour les embeddings */
  OPENROUTER_EMBEDDINGS: 'https://openrouter.ai/api/v1/embeddings',
  
  /** Referer pour les requêtes OpenRouter */
  OPENROUTER_REFERER: 'https://dangerousbot.local',
  
  /** Titre pour les requêtes OpenRouter */
  OPENROUTER_TITLE: 'DangerousBot',
  
  /** URL de l'API Mistral */
  MISTRAL_BASE_URL: 'https://api.mistral.ai/v1',
  
  /** Clé API Mistral (chargée au runtime) */
  MISTRAL_API_KEY: '' as string,
  
  /** Clé API OpenRouter (chargée au runtime) */
  OPENROUTER_API_KEY: '' as string,
  
  /** Clé API Kimi/Moonshot (chargée au runtime) */
  KIMI_API_KEY: '' as string,
  
  /** Token API Telegram Bot */
  TELEGRAM_BOT_TOKEN: '***REMOVED***' as string,
  
  /** IDs utilisateurs Telegram autorisés (numériques) */
  TELEGRAM_USER_IDS: [] as number[],
  
  /** Usernames Telegram autorisés (sans le @) */
  TELEGRAM_USERNAMES: ['***REMOVED***'] as string[],
};

// ============================================================================
// EXPORT GLOBAL
// ============================================================================

// ============================================================================
// CHARGEMENT DES CLÉS API
// ============================================================================

import * as fs from 'fs';

/**
 * Charge une clé API depuis un fichier
 */
export function loadApiKey(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim();
    }
  } catch (e) {
    console.warn(`Could not load API key from ${filePath}`);
  }
  return '';
}

/**
 * Initialise les clés API depuis les fichiers secrets
 */
export function initializeApiKeys(): void {
  APIS.MISTRAL_API_KEY = loadApiKey(PATHS.MISTRAL_KEY_FILE);
  APIS.OPENROUTER_API_KEY = loadApiKey(PATHS.OPENROUTER_KEY_FILE);
  APIS.KIMI_API_KEY = loadApiKey(PATHS.KIMI_KEY_FILE);
}

/**
 * Charge l'ID utilisateur Telegram autorisé
 */
export function loadTelegramUserId(): number {
  const userIdStr = loadApiKey(PATHS.TELEGRAM_USER_ID_FILE);
  const userId = parseInt(userIdStr, 10);
  APIS.TELEGRAM_USER_ID = isNaN(userId) ? 0 : userId;
  return APIS.TELEGRAM_USER_ID;
}

/**
 * Recharge la config du provider actif depuis la DB (pour hot-swap et persistance)
 */
export function reloadProviderConfig(): ProviderType {
  try {
    // Dynamic import to avoid circular dependency
    const { getMemory } = require('./core/memory');
    const memory = getMemory();
    const savedProvider = memory.getConfig('provider');
    if (savedProvider && (savedProvider === 'claude' || savedProvider === 'kimi')) {
      (PROVIDER as any).ACTIVE = savedProvider;
      console.log(`[Config] Provider loaded from DB: ${savedProvider}`);
      return savedProvider;
    }
  } catch (e) {
    console.warn('[Config] Could not load provider from DB:', e);
  }
  return PROVIDER.ACTIVE;
}

/**
 * Change le provider actif et le persiste en DB
 */
export function setActiveProvider(provider: ProviderType): void {
  (PROVIDER as any).ACTIVE = provider;
  
  // Persist in DB
  try {
    const { getMemory } = require('./core/memory');
    const memory = getMemory();
    memory.setConfig('provider', provider);
    console.log(`[Config] Provider changed and persisted: ${provider}`);
  } catch (e) {
    console.warn('[Config] Could not persist provider to DB:', e);
  }
}

// ============================================================================
// EXPORT GLOBAL
// ============================================================================

export const config = {
  PROVIDER,
  MODELS,
  TOKENS,
  MEMORY,
  SERVER,
  PATHS,
  APIS,
  ROLLBACK,
};

export const CONFIG = config;
export default config;
