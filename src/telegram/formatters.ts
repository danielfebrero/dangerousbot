/**
 * Fonctions de formatage pour Telegram
 */

import { TOOL_EMOJIS, DEFAULT_TOOL_EMOJI, TELEGRAM_SAFE_LIMIT } from './constants.js';

/**
 * Retourne l'emoji correspondant à un tool
 */
export function getToolEmoji(toolName: string): string {
  return TOOL_EMOJIS[toolName] || DEFAULT_TOOL_EMOJI;
}

/**
 * Formate un badge de tool avec son statut
 */
export function formatToolBadge(toolName: string, success: boolean): string {
  const emoji = getToolEmoji(toolName);
  const status = success ? '✓' : '✗';
  return `${emoji} ${toolName} ${status}`;
}

/**
 * Formate plusieurs badges de tools
 */
export function formatToolBadges(tools: Array<{ name: string; success: boolean }>): string {
  const badges = tools.map(t => formatToolBadge(t.name, t.success));
  return `🔧 ${badges.join(' | ')}`;
}

/**
 * Découpe un message trop long en plusieurs parties
 */
export function splitMessage(text: string, maxLength: number = TELEGRAM_SAFE_LIMIT): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const parts: string[] = [];
  let current = '';

  const lines = text.split('\n');
  for (const line of lines) {
    if (current.length + line.length + 1 > maxLength) {
      if (current) {
        parts.push(current);
      }
      // Si une seule ligne est trop longue, la couper
      if (line.length > maxLength) {
        let remaining = line;
        while (remaining.length > maxLength) {
          parts.push(remaining.slice(0, maxLength));
          remaining = remaining.slice(maxLength);
        }
        current = remaining;
      } else {
        current = line;
      }
    } else {
      current += (current ? '\n' : '') + line;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Échappe les caractères spéciaux Markdown pour Telegram
 * Note: Telegram utilise une version simplifiée de Markdown
 */
export function escapeMarkdown(text: string): string {
  // Caractères à échapper: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Formate un bloc de code pour Telegram
 */
export function formatCodeBlock(code: string, language?: string): string {
  if (language) {
    return `\`\`\`${language}\n${code}\n\`\`\``;
  }
  return `\`\`\`\n${code}\n\`\`\``;
}

/**
 * Formate du texte en gras
 */
export function bold(text: string): string {
  return `*${text}*`;
}

/**
 * Formate du texte en italique
 */
export function italic(text: string): string {
  return `_${text}_`;
}

/**
 * Formate du texte en code inline
 */
export function code(text: string): string {
  return `\`${text}\``;
}
