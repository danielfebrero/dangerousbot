/**
 * Tool: download_file - Télécharge un fichier depuis une URL
 * Stocke le fichier et retourne les métadonnées
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { downloadService } from '../services/download';
import { checkCancellation } from '../tool-cancellation';

export const downloadFileDefinition: Tool = {
  name: 'download_file',
  description: `Télécharge un fichier depuis une URL Internet et le stocke localement.

Le fichier est tracké en base de données avec ses métadonnées (taille, type, etc.)
et sera automatiquement supprimé si la limite de stockage est dépassée.

Retourne l'ID du fichier qui pourra être utilisé avec 'send_file' pour l'envoyer.

Exemple:
- download_file({ url: "https://example.com/document.pdf" })
- download_file({ url: "https://example.com/image.jpg", filename: "mon_image.jpg" })`,
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL du fichier à télécharger'
      },
      filename: {
        type: 'string',
        description: 'Nom de fichier personnalisé (optionnel)'
      }
    },
    required: ['url']
  }
};

export const downloadFileHandler: ToolHandler = {
  name: 'download_file',
  definition: downloadFileDefinition,

  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const url = input.url as string;
    const customFilename = input.filename as string | undefined;
    const signal = context.abortSignal;

    if (!url) {
      return { success: false, error: 'URL requise' };
    }

    try {
      checkCancellation(signal);

      const result = await downloadService.downloadFile(url, {
        filename: customFilename,
        source: 'webapp',
        abortSignal: signal
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Formater la taille pour l'affichage
      const sizeFormatted = formatBytes(result.size || 0);

      return {
        success: true,
        data: {
          fileId: result.fileId,
          filename: result.filename,
          originalName: customFilename || result.filename,
          size: result.size,
          sizeFormatted,
          mimeType: result.mimeType,
          path: result.path
        },
        message: `✅ Fichier téléchargé: ${result.filename} (${sizeFormatted})`
      };

    } catch (error) {
      const errorMessage = (error as Error).message;

      // Détecter si c'est une annulation
      if (errorMessage.includes('cancelled') || errorMessage.includes('abort')) {
        return {
          success: false,
          cancelled: true,
          error: 'Téléchargement annulé par l\'utilisateur'
        };
      }

      return {
        success: false,
        error: `Erreur lors du téléchargement: ${errorMessage}`
      };
    }
  }
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
