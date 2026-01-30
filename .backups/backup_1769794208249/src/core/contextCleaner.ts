/**
 * Nettoie les tool_results volumineux des anciens messages
 * pour éviter de polluer le contexte avec des fichiers entiers
 */

interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string | any[];
}

const THRESHOLDS = {
  MAX_LINES_FILE: 50,        // Résumer les fichiers > 50 lignes
  MAX_CHARS_OUTPUT: 1000,    // Tronquer les outputs > 1000 chars
  MAX_CHARS_SHELL: 500,      // Tronquer les shell outputs > 500 chars
  KEEP_RECENT_COUNT: 2,      // Garder les N derniers messages intacts
};

/**
 * Résume un contenu de fichier volumineux
 */
function summarizeFileContent(content: string): string {
  const lines = content.split('\n');
  const lineCount = lines.length;
  const charCount = content.length;
  const sizeKB = (charCount / 1024).toFixed(1);
  
  if (lineCount <= THRESHOLDS.MAX_LINES_FILE) {
    return content;
  }
  
  // Garder les premières et dernières lignes pour contexte
  const previewLines = 5;
  const preview = lines.slice(0, previewLines).join('\n');
  const ending = lines.slice(-3).join('\n');
  
  return `[Fichier: ${lineCount} lignes, ${sizeKB}KB]\n--- Début ---\n${preview}\n...\n--- Fin ---\n${ending}`;
}

/**
 * Résume un output de commande shell
 */
function summarizeShellOutput(content: string): string {
  if (content.length <= THRESHOLDS.MAX_CHARS_SHELL) {
    return content;
  }
  
  const truncated = content.slice(0, THRESHOLDS.MAX_CHARS_SHELL);
  return `${truncated}\n... [tronqué, ${content.length} chars total]`;
}

/**
 * Résume un output de code exécuté
 */
function summarizeCodeOutput(content: string): string {
  if (content.length <= THRESHOLDS.MAX_CHARS_OUTPUT) {
    return content;
  }
  
  const truncated = content.slice(0, THRESHOLDS.MAX_CHARS_OUTPUT);
  return `${truncated}\n... [tronqué, ${content.length} chars total]`;
}

/**
 * Nettoie un tool_result individuel
 */
function cleanToolResult(content: string, toolName?: string): string {
  // Détecter le type de contenu
  const isFileContent = content.includes('Contenu du fichier') || 
                        content.includes('export ') ||
                        content.includes('import ') ||
                        content.split('\n').length > THRESHOLDS.MAX_LINES_FILE;
  
  const isShellOutput = toolName === 'shell' || 
                        content.includes('npm ') ||
                        content.includes('$ ');
  
  const isCodeOutput = toolName === 'execute_code';
  
  if (isFileContent) {
    return summarizeFileContent(content);
  } else if (isShellOutput) {
    return summarizeShellOutput(content);
  } else if (isCodeOutput) {
    return summarizeCodeOutput(content);
  } else if (content.length > THRESHOLDS.MAX_CHARS_OUTPUT) {
    return content.slice(0, THRESHOLDS.MAX_CHARS_OUTPUT) + `\n... [tronqué]`;
  }
  
  return content;
}

/**
 * Nettoie les tool_results des anciens messages
 * Garde les messages récents intacts
 */
export function cleanOldToolResults(messages: Message[]): Message[] {
  const recentCount = THRESHOLDS.KEEP_RECENT_COUNT;
  
  return messages.map((msg, index) => {
    // Garder les messages récents intacts
    const isRecent = index >= messages.length - recentCount;
    if (isRecent) {
      return msg;
    }
    
    // Si le contenu est un tableau (avec tool_results)
    if (Array.isArray(msg.content)) {
      const cleanedContent = msg.content.map((block: any) => {
        if (block.type === 'tool_result') {
          return {
            ...block,
            content: cleanToolResult(block.content, block.tool_name)
          };
        }
        return block;
      });
      
      return { ...msg, content: cleanedContent };
    }
    
    return msg;
  });
}

export { THRESHOLDS };
