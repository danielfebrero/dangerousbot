/**
 * Constantes pour le bot Telegram
 */

/** Emojis par nom de tool */
export const TOOL_EMOJIS: Record<string, string> = {
  execute_code: '💻',
  shell: '🐚',
  read_file: '📄',
  write_file: '📝',
  edit_file: '✏️',
  delete_file: '🗑️',
  list_files: '📁',
  remember: '🧠',
  recall: '📚',
  self_update: '🔄',
  restart_server: '🔁',
  switch_provider: '🔀',
  consult_mistral: '💭',
  searxng_search: '🔍',
  get_kimi_balance: '💰',
  todo: '✅',
  retrieve_code: '🔎',
  log: '📋',
  set_log_level: '⚙️',
  clear_logs: '🧹',
  telegram: '👤',
};

/** Emoji par défaut pour les tools non listés */
export const DEFAULT_TOOL_EMOJI = '🔧';

/** Limite de caractères par message Telegram */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/** Limite de caractères pour un message sûr (avec marge) */
export const TELEGRAM_SAFE_LIMIT = 4000;

/** Messages d'erreur */
export const MESSAGES = {
  UNAUTHORIZED: '⛔ Vous n\'êtes pas autorisé à utiliser ce bot.',
  ERROR: '❌ Une erreur s\'est produite. Veuillez réessayer.',
  UNKNOWN_MESSAGE_TYPE: '❓ Je ne comprends pas ce type de message.',
  IMAGE_PLACEHOLDER: '[Image]',
} as const;

/** Messages de commandes */
export const COMMAND_MESSAGES = {
  START: `🤖 *DangerousBot*

Je suis ton assistant IA auto-modifiable.

• Envoi-moi des messages texte
• Partage des photos
• Pose-moi des questions sur ton code

Toutes les conversations sont synchronisées avec l'interface web.`,

  HELP: `*Commandes disponibles:*

/start - Démarrer
/status - Voir le statut
/web - Lien vers l'interface web
/provider - Voir le provider actif
/help - Cette aide`,

  WEB: '🌐 Interface web:\n\nhttp://localhost:3000',
} as const;
