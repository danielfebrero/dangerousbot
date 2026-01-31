/**
 * Tool: send_file - Envoie un fichier dans le chat
 * 
 * Webapp: Retourne une URL de téléchargement
 * Telegram: Envoie le fichier directement puis le supprime localement
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { downloadService } from '../services/download';
import * as fs from 'fs';

export const sendFileDefinition: Tool = {
  name: 'send_file',
  description: `Envoie un fichier dans le chat (webapp ou Telegram).

WEBAPP:
- Accepte: file_id (depuis download_file) OU url (téléchargement direct)
- Retourne: URL de téléchargement à afficher dans le chat
- Le fichier est conservé selon la limite de stockage configurée

TELEGRAM:
- Accepte: file_id OU url
- Envoie le fichier directement dans le chat Telegram
- Supprime automatiquement le fichier local après envoi réussi

Exemples:
- send_file({ file_id: 123 })  // Envoie un fichier déjà téléchargé
- send_file({ url: "https://example.com/doc.pdf" })  // Télécharge et envoie
- send_file({ file_id: 123, platform: "telegram" })  // Force l'envoi Telegram`,
  input_schema: {
    type: 'object',
    properties: {
      file_id: {
        type: 'number',
        description: 'ID du fichier (retourné par download_file)'
      },
      url: {
        type: 'string',
        description: 'URL du fichier à télécharger et envoyer'
      },
      platform: {
        type: 'string',
        enum: ['webapp', 'telegram', 'auto'],
        description: 'Plateforme cible (détection auto par défaut)'
      }
    },
    required: []
  }
};

// Fonctions utilitaires définies en dehors du handler
async function detectPlatform(platform: string, context: ToolContext): Promise<'webapp' | 'telegram'> {
  if (platform === 'webapp') return 'webapp';
  if (platform === 'telegram') return 'telegram';
  
  // Auto-détection basée sur le contexte
  if (context.telegramChatId) return 'telegram';
  return 'webapp';
}

async function sendFileById(
  fileId: number,
  platform: 'webapp' | 'telegram',
  context: ToolContext
): Promise<ToolResult> {
  const file = await downloadService.getFile(fileId);

  if (!file) {
    return { success: false, error: `Fichier #${fileId} introuvable` };
  }

  const filePath = downloadService.getFilePath(file.filename);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `Fichier #${fileId} n'existe plus sur le disque` };
  }

  if (platform === 'telegram') {
    return await sendToTelegram(file, filePath, context);
  } else {
    return await sendToWebapp(file);
  }
}

async function sendToTelegram(
  file: any,
  filePath: string,
  context: ToolContext
): Promise<ToolResult> {
  // Vérifier que Telegram est disponible
  if (!context.bot || !context.telegramChatId) {
    return { success: false, error: 'Telegram non disponible dans ce contexte' };
  }

  try {
    // Déterminer le type de fichier
    const mimeType = file.mime_type || 'application/octet-stream';
    const isPhoto = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');
    const isAudio = mimeType.startsWith('audio/');

    // Envoyer selon le type
    if (isPhoto) {
      await context.bot.sendPhoto(context.telegramChatId, filePath, {
        caption: `📎 ${file.original_name || file.filename}`
      });
    } else if (isVideo) {
      await context.bot.sendVideo(context.telegramChatId, filePath, {
        caption: `📎 ${file.original_name || file.filename}`
      });
    } else if (isAudio) {
      await context.bot.sendAudio(context.telegramChatId, filePath, {
        caption: `📎 ${file.original_name || file.filename}`
      });
    } else {
      await context.bot.sendDocument(context.telegramChatId, filePath, {
        caption: `📎 ${file.original_name || file.filename}`
      });
    }

    // Supprimer le fichier local après envoi réussi
    await downloadService.deleteFile(file.id);

    return {
      success: true,
      data: {
        fileId: file.id,
        filename: file.original_name || file.filename,
        size: file.size_bytes,
        platform: 'telegram',
        deleted: true
      },
      message: `✅ Fichier envoyé sur Telegram et supprimé localement`
    };

  } catch (error) {
    return {
      success: false,
      error: `Erreur envoi Telegram: ${(error as Error).message}`
    };
  }
}

async function sendToWebapp(file: any): Promise<ToolResult> {
  // Construire l'URL de téléchargement
  const downloadUrl = `/api/files/${file.id}`;

  return {
    success: true,
    data: {
      fileId: file.id,
      filename: file.original_name || file.filename,
      size: file.size_bytes,
      mimeType: file.mime_type,
      platform: 'webapp',
      url: downloadUrl,
      markdown: `[📎 ${file.original_name || file.filename} (${formatBytes(file.size_bytes)})](${downloadUrl})`
    },
    message: `Fichier prêt: ${downloadUrl}`
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const sendFileHandler: ToolHandler = {
  name: 'send_file',
  definition: sendFileDefinition,

  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const fileId = input.file_id as number | undefined;
    const url = input.url as string | undefined;
    const platform = (input.platform as string) || 'auto';

    // Déterminer la plateforme
    const targetPlatform = await detectPlatform(platform, context);

    try {
      // Cas 1: URL fournie - télécharger d'abord
      if (url && !fileId) {
        const downloadResult = await downloadService.downloadFile(url, {
          source: targetPlatform === 'telegram' ? 'telegram' : 'webapp',
          telegramChatId: context.telegramChatId
        });

        if (!downloadResult.success) {
          return { success: false, error: downloadResult.error };
        }

        // Envoyer le fichier téléchargé
        return await sendFileById(
          downloadResult.fileId!,
          targetPlatform,
          context
        );
      }

      // Cas 2: file_id fourni
      if (fileId) {
        return await sendFileById(fileId, targetPlatform, context);
      }

      return {
        success: false,
        error: 'Vous devez fournir soit file_id, soit url'
      };

    } catch (error) {
      return {
        success: false,
        error: `Erreur lors de l'envoi: ${(error as Error).message}`
      };
    }
  }
};
