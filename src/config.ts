/**
 * Configuration centrale de DangerousBot
 * Toutes les valeurs configurables sont ici.
 */

import * as path from 'path';
import * as os from 'os';

// ============================================================================
// PROVIDER ACTIF (hot-swappable)
// ============================================================================

export type ProviderType = 'claude' | 'kimi' | 'mistral' | 'grok';

export const PROVIDER = {
  /** Provider actif ('claude', 'kimi', 'mistral' ou 'grok') - modifiable à chaud */
  ACTIVE: 'kimi' as ProviderType,
} as const;

// ============================================================================
// MODÈLES IA
// ============================================================================

export const MODELS = {
  // --- Modèles Brain (providers principaux) ---

  /** Claude Opus 4.5 (Anthropic) */
  CLAUDE: 'claude-opus-4-5-20251101',

  /** Kimi K2.5 (Moonshot) */
  KIMI: 'kimi-k2.5',

  /** Mistral Large (Mistral AI) - utilisable comme brain ou consultation */
  MISTRAL_LARGE: 'mistral-large-2411',

  // --- Modèles Consultation (second regard) ---

  /** Mistral Medium - brainstorming, validation */
  MISTRAL_MEDIUM: 'mistral-medium-2505',

  /** Mistral Small - tâches rapides, formatting */
  MISTRAL_SMALL: 'mistral-small-2503',

  // --- Modèles Grok (xAI) ---

  /** Grok raisonnement avancé */
  GROK_REASONING: 'grok-4-1-fast-reasoning',

  /** Grok rapide sans raisonnement */
  GROK_NON_REASONING: 'grok-4-1-fast-non-reasoning',

  // --- Embeddings ---

  /** Embeddings (via OpenRouter) */
  EMBEDDING: 'qwen/qwen3-embedding-8b',
} as const;

// ============================================================================
// TOKENS & LIMITES
// ============================================================================

export const TOKENS = {
  /** Max tokens pour les réponses du brain */
  MAX_RESPONSE: 32768,

  /** Max tokens pour les résumés de compression */
  MAX_COMPRESSION_SUMMARY: 8096,

  /** Max tokens pour les réponses de consultation IA (Mistral, Grok, etc.) */
  MAX_CONSULT_AI_RESPONSE: 2048,
} as const;

// ============================================================================
// MÉMOIRE & COMPRESSION
// ============================================================================

export const MEMORY = {
  /** Limite de tokens (in+out) avant compression automatique */
  TOKEN_LIMIT_FOR_COMPRESSION: 128000,

  /** Nombre de mémoires pertinentes à récupérer par recherche sémantique */
  RELEVANT_MEMORIES_TOP_K: 8,
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
// TOOL RESULTS PERSISTENCE
// ============================================================================

export const TOOL_RESULTS = {
  /** Nombre de jours de rétention des résultats */
  RETENTION_DAYS: 30,

  /** Nombre maximum d'exécutions par thread (rotation FIFO) */
  MAX_EXECUTIONS_PER_THREAD: 10000,

  /** Taille maximum d'un résultat (10 MB) */
  MAX_OUTPUT_SIZE_BYTES: 10 * 1024 * 1024,

  /** Longueur maximum de l'aperçu dans le résumé */
  SUMMARY_PREVIEW_LENGTH: 200,
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
  
  /** Fichier de clé API Grok (xAI) */
  get GROK_KEY_FILE() { return path.join(this.SECRETS_DIR, 'grok_api_key'); },
  
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

  /** URL de l'API Grok (xAI) */
  GROK_BASE_URL: 'https://api.x.ai/v1',
  
  /** Clé API Mistral (chargée au runtime) */
  MISTRAL_API_KEY: '' as string,

  /** Clé API OpenRouter (chargée au runtime) */
  OPENROUTER_API_KEY: '' as string,

  /** Clé API Kimi/Moonshot (chargée au runtime) */
  KIMI_API_KEY: '' as string,

  /** Clé API Grok/xAI (chargée au runtime) */
  GROK_API_KEY: '' as string,
  
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
  APIS.GROK_API_KEY = loadApiKey(PATHS.GROK_KEY_FILE);
}

/**
 * Charge l'ID utilisateur Telegram autorisé
 */
export function loadTelegramUserId(): number {
  const userIdStr = loadApiKey(PATHS.TELEGRAM_USER_ID_FILE);
  const userId = parseInt(userIdStr, 10);
  (APIS as any).TELEGRAM_USER_ID = isNaN(userId) ? 0 : userId;
  return (APIS as any).TELEGRAM_USER_ID;
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
    if (savedProvider && (savedProvider === 'claude' || savedProvider === 'kimi' || savedProvider === 'mistral' || savedProvider === 'grok')) {
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
  TOOL_RESULTS,
};

export const CONFIG = config;
export default config;
