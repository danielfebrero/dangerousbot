/**
 * Tools - Définition des outils disponibles pour DangerousBot
 */

import { Tool, ToolResult, ToolInput } from './types';
import { Executor } from './executor';
import { getMemory } from './memory';
import { Versioning } from './versioning';
import { Lifecycle } from './lifecycle';

export function getToolDefinitions(): Tool[] {
  return [
    {
      name: 'execute_code',
      description: 'Exécute du code JavaScript. Par défaut en mémoire (sandboxé). Si in_memory=false, crée un fichier temporaire.',
      input_schema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Le code JavaScript à exécuter' },
          in_memory: { type: 'boolean', description: 'true (défaut) pour exécuter en mémoire, false pour fichier temporaire' },
          filename: { type: 'string', description: 'Nom du fichier si in_memory=false' }
        },
        required: ['code']
      }
    },
    {
      name: 'shell',
      description: 'Exécute une commande shell. Utilise pour git, npm, ou toute autre commande système.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'La commande à exécuter' },
          cwd: { type: 'string', description: 'Répertoire de travail (optionnel)' }
        },
        required: ['command']
      }
    },
    {
      name: 'read_file',
      description: 'Lit le contenu d\'un fichier.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Chemin du fichier (relatif au projet ou absolu)' }
        },
        required: ['path']
      }
    },
    {
      name: 'write_file',
      description: 'Écrit du contenu dans un fichier. Crée le fichier et les répertoires parents si nécessaire.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Chemin du fichier' },
          content: { type: 'string', description: 'Contenu à écrire' }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'edit_file',
      description: 'Modifie un fichier existant en remplaçant une chaîne par une autre.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Chemin du fichier à modifier' },
          old_string: { type: 'string', description: 'La chaîne à rechercher' },
          new_string: { type: 'string', description: 'La chaîne de remplacement' },
          replace_all: { type: 'boolean', description: 'true pour remplacer toutes les occurrences' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    },
    {
      name: 'list_files',
      description: 'Liste les fichiers et dossiers dans un répertoire.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Chemin du répertoire' }
        },
        required: ['path']
      }
    },
    {
      name: 'delete_file',
      description: 'Supprime un fichier.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Chemin du fichier à supprimer' }
        },
        required: ['path']
      }
    },
    {
      name: 'remember',
      description: 'Sauvegarde une information importante dans la mémoire long-terme.',
      input_schema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Type d\'information',
            enum: ['fact', 'preference', 'context', 'skill']
          },
          content: { type: 'string', description: 'L\'information à retenir' }
        },
        required: ['type', 'content']
      }
    },
    {
      name: 'recall',
      description: 'Récupère des informations de la mémoire long-terme.',
      input_schema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Type d\'information à récupérer (optionnel)',
            enum: ['fact', 'preference', 'context', 'skill']
          }
        },
        required: []
      }
    },
    {
      name: 'self_update',
      description: 'Modifie le code source de DangerousBot, versionne, compile et redémarre. ATTENTION: outil puissant.',
      input_schema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Fichier à modifier (relatif à src/)' },
          old_code: { type: 'string', description: 'Code à remplacer' },
          new_code: { type: 'string', description: 'Nouveau code' },
          description: { type: 'string', description: 'Description de la modification' }
        },
        required: ['file', 'old_code', 'new_code', 'description']
      }
    },
    {
      name: 'restart_server',
      description: 'Redémarre le serveur DangerousBot. Utilise après des modifications de code.',
      input_schema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Raison du redémarrage' }
        },
        required: []
      }
    }
  ];
}

export class ToolExecutor {
  private executor: Executor;
  private versioning: Versioning;
  private lifecycle: Lifecycle;
  private askUserCallback?: (question: string) => Promise<string>;

  constructor(projectRoot: string) {
    this.executor = new Executor(projectRoot);
    this.versioning = new Versioning(projectRoot);
    this.lifecycle = new Lifecycle(projectRoot);
  }

  setAskUserCallback(callback: (question: string) => Promise<string>): void {
    this.askUserCallback = callback;
  }

  async execute(toolName: string, input: ToolInput): Promise<ToolResult> {
    const memory = getMemory();

    switch (toolName) {
      case 'execute_code': {
        const code = input.code as string;
        const inMemory = input.in_memory !== false;

        if (inMemory) {
          return await this.executor.executeInMemory(code);
        } else {
          const filename = (input.filename as string) || 'temp.js';
          return await this.executor.executeFile(code, filename);
        }
      }

      case 'shell': {
        const command = input.command as string;
        const cwd = input.cwd as string | undefined;
        return await this.executor.shell(command, { cwd });
      }

      case 'read_file': {
        const filePath = input.path as string;
        return this.executor.readFile(filePath);
      }

      case 'write_file': {
        const filePath = input.path as string;
        const content = input.content as string;
        return this.executor.writeFile(filePath, content);
      }

      case 'edit_file': {
        const filePath = input.path as string;
        const oldString = input.old_string as string;
        const newString = input.new_string as string;
        const replaceAll = input.replace_all as boolean || false;
        return this.executor.editFile(filePath, oldString, newString, replaceAll);
      }

      case 'list_files': {
        const dirPath = input.path as string;
        return this.executor.listFiles(dirPath);
      }

      case 'delete_file': {
        const filePath = input.path as string;
        return this.executor.deleteFile(filePath);
      }

      case 'remember': {
        const type = input.type as 'fact' | 'preference' | 'context' | 'skill';
        const content = input.content as string;
        const id = memory.addKnowledge(type, content);
        return { success: true, id, message: `Information mémorisée (${type})` };
      }

      case 'recall': {
        const type = input.type as 'fact' | 'preference' | 'context' | 'skill' | undefined;
        const knowledge = memory.getKnowledge(type);
        return { success: true, knowledge };
      }

      case 'self_update': {
        const file = input.file as string;
        const oldCode = input.old_code as string;
        const newCode = input.new_code as string;
        const description = input.description as string;

        // 1. Modifier le fichier
        const editResult = this.executor.editFile(`src/${file}`, oldCode, newCode);
        if (!editResult.success) {
          return editResult;
        }

        // 2. Versionner
        const versionResult = await this.versioning.commitChanges(description);
        if (!versionResult.success) {
          return { success: false, error: `Modification OK mais erreur de versioning: ${versionResult.error}` };
        }

        // 3. Compiler
        const buildResult = await this.executor.shell('npm run build');
        if (!buildResult.success) {
          return { success: false, error: `Modification OK mais erreur de compilation: ${buildResult.error}` };
        }

        // 4. Planifier le redémarrage
        return {
          success: true,
          message: 'Code modifié, versionné et compilé. Redémarrage nécessaire.',
          version: versionResult.version,
          needsRestart: true
        };
      }

      case 'restart_server': {
        const reason = (input.reason as string) || 'Demandé par le bot';

        // Planifier le redémarrage (sera effectué après la réponse)
        setTimeout(() => {
          this.lifecycle.restart(reason);
        }, 1000);

        return {
          success: true,
          message: `Redémarrage planifié: ${reason}`
        };
      }

      default:
        return { success: false, error: `Outil inconnu: ${toolName}` };
    }
  }
}
