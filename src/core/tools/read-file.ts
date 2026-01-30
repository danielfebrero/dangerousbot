/**
 * Tool: read_file - Lit un fichier (texte ou image)
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

export const readFileDefinition: Tool = {
  name: 'read_file',
  description: 'Lit le contenu d\'un fichier. Pour les images (png, jpg, gif, webp, etc.), retourne les données en base64 pour les modèles multimodaux.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Chemin du fichier (relatif au projet ou absolu). Supporte les images pour les modèles multimodaux.' }
    },
    required: ['path']
  }
};

export const readFileHandler: ToolHandler = {
  name: 'read_file',
  definition: readFileDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = input.path as string;
    
    // Vérifier si c'est une image
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
    
    if (imageExts.includes(ext)) {
      // Lire comme image pour les modèles multimodaux
      const imageResult = context.executor.readImage(filePath);
      if (imageResult.success && imageResult.data && imageResult.media_type) {
        return {
          success: true,
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageResult.media_type,
            data: imageResult.data
          },
          message: `Image lue: ${filePath}`
        };
      }
      return imageResult;
    }
    
    // Lire comme texte
    return context.executor.readFile(filePath);
  }
};
