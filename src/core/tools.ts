/**
 * Tools - Définition des outils disponibles pour DangerousBot
 */

import { Tool, ToolResult, ToolInput } from './types';
import { Executor } from './executor';
import { getMemory } from './memory';
import { Versioning } from './versioning';
import { Lifecycle } from './lifecycle';
import { MistralConsultant, mistralTool } from './mistral';
import { getRollbackManager } from './rollback';
import { setActiveProvider, ProviderType, APIS, PATHS } from '../config';
import { getTodoManager } from './todo';

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
      description: 'Lit le contenu d\'un fichier. Pour les images (png, jpg, gif, webp, etc.), retourne les données en base64 pour les modèles multimodaux.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Chemin du fichier (relatif au projet ou absolu). Supporte les images pour les modèles multimodaux.' }
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
      description: 'Compile et redémarre DangerousBot. À utiliser après avoir modifié des fichiers avec edit_file/write_file. Effectue: validation TypeScript, build, et redémarrage avec rollback automatique en cas d\'échec.',
      input_schema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Raison du redémarrage (optionnel)' }
        },
        required: []
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
    },
    mistralTool as Tool,
    {
      name: 'switch_provider',
      description: 'Change le provider AI actif (Claude ou Kimi). Le changement prend effet immédiatement pour le prochain message.',
      input_schema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            description: 'Le provider à utiliser',
            enum: ['claude', 'kimi']
          }
        },
        required: ['provider']
      }
    },
    {
      name: 'web_search',
      description: 'Effectue une recherche web pour obtenir des informations récentes et à jour. Disponible uniquement avec le provider Kimi. Utilise la fonction builtin $web_search de Kimi.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'La requête de recherche (optionnel - Kimi génère les paramètres automatiquement)' }
        },
        required: []
      }
    },
    {
      name: 'get_kimi_balance',
      description: 'Récupère les crédits disponibles sur le compte Moonshot AI (Kimi). Utile pour vérifier le solde restant en USD (cash + vouchers) avant d\'effectuer des opérations coûteuses.',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'todo',
      description: 'Gère des projets et tâches TODO pour organiser le travail. Permet de créer des projets, y ajouter des tâches ordonnées, et suivre leur complétion. Usage: todo({type: "create_project", name: "nom"}) ou todo({type: "create_task", project_id: 1, title: "tâche"}) etc.',
      input_schema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Action à effectuer',
            enum: ['create_project', 'delete_project', 'list_projects', 'create_task', 'complete_task', 'uncomplete_task', 'delete_task', 'list_tasks', 'get_project', 'reorder_tasks']
          },
          name: { type: 'string', description: 'Nom du projet (pour create_project)' },
          description: { type: 'string', description: 'Description optionnelle' },
          project_id: { type: 'number', description: 'ID du projet' },
          task_id: { type: 'number', description: 'ID de la tâche' },
          title: { type: 'string', description: 'Titre de la tâche (pour create_task)' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priorité de la tâche (default: medium)' },
          status: { type: 'string', enum: ['all', 'pending', 'completed'], description: 'Filtre de statut (pour list_tasks)' },
          task_ids: { type: 'array', items: { type: 'number' }, description: 'Ordre des IDs de tâches (pour reorder_tasks)' }
        },
        required: ['type']
      }
    }
  ];
}

export class ToolExecutor {
  private executor: Executor;
  private versioning: Versioning;
  private lifecycle: Lifecycle;
  private mistral: MistralConsultant | null = null;
  private askUserCallback?: (question: string) => Promise<string>;

  constructor(projectRoot: string) {
    this.executor = new Executor(projectRoot);
    this.versioning = new Versioning(projectRoot);
    this.lifecycle = new Lifecycle(projectRoot);
    
    // Initialiser Mistral si la clé est disponible
    try {
      this.mistral = new MistralConsultant();
    } catch (e) {
      console.warn('[Tools] Mistral not available:', (e as Error).message);
    }
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
        
        // Vérifier si c'est une image
        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
        const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
        
        if (imageExts.includes(ext)) {
          // Lire comme image pour les modèles multimodaux
          const imageResult = this.executor.readImage(filePath);
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
        const description = (input.reason as string) || 'Mise à jour du système';
        
        // Utiliser le système de rollback si disponible
        const rollbackManager = getRollbackManager();
        
        if (rollbackManager) {
          // Mode sécurisé avec rollback automatique
          const result = await rollbackManager.safeUpdate(
            description,
            async () => {
              // Juste compiler - les modifications ont déjà été faites via edit_file/write_file
              const buildResult = await this.executor.shell('npm run build');
              if (!buildResult.success) {
                throw new Error(`Échec compilation: ${buildResult.error}`);
              }
            },
            [] // Pas de fichiers spécifiques à sauvegarder (déjà versionnés via edit_file)
          );

          if (!result.success) {
            return {
              success: false,
              error: result.error,
              message: result.message,
              rollback: true,
              backupId: result.backupId
            };
          }

          // Versionner après succès
          const versionResult = await this.versioning.commitChanges(description);

          // Programmer le redémarrage (créer le fichier .restart)
          const fs = await import('fs');
          const path = await import('path');
          const restartFile = path.join(process.cwd(), '.restart');
          fs.writeFileSync(restartFile, JSON.stringify({
            reason: description,
            timestamp: new Date().toISOString()
          }));
          (global as any).__pendingRestart = { reason: description };

          return {
            success: true,
            message: `✅ ${result.message} - Redémarrage programmé`,
            version: versionResult.version,
            backupId: result.backupId,
            needsRestart: true
          };
        } else {
          // Mode legacy sans rollback
          console.warn('[self_update] RollbackManager non disponible, mode legacy');

          // 1. Compiler
          const buildResult = await this.executor.shell('npm run build');
          if (!buildResult.success) {
            return { success: false, error: `Erreur de compilation: ${buildResult.error}` };
          }

          // 2. Versionner
          const versionResult = await this.versioning.commitChanges(description);
          if (!versionResult.success) {
            return { success: false, error: `Build OK mais erreur de versioning: ${versionResult.error}` };
          }

          // 3. Programmer le redémarrage (créer le fichier .restart)
          const fs = await import('fs');
          const path = await import('path');
          const restartFile = path.join(process.cwd(), '.restart');
          fs.writeFileSync(restartFile, JSON.stringify({
            reason: description,
            timestamp: new Date().toISOString()
          }));
          (global as any).__pendingRestart = { reason: description };

          return {
            success: true,
            message: 'Build réussi et redémarrage programmé.',
            version: versionResult.version,
            needsRestart: true
          };
        }
      }

      case 'restart_server': {
        const reason = (input.reason as string) || 'Demandé par le bot';
        const fs = await import('fs');
        const path = await import('path');

        // Créer le fichier .restart que start.sh surveille
        const restartFile = path.join(process.cwd(), '.restart');
        fs.writeFileSync(restartFile, JSON.stringify({
          reason,
          timestamp: new Date().toISOString()
        }));

        // Stocker le flag pour que le serveur déclenche le restart APRÈS la sauvegarde
        (global as any).__pendingRestart = { reason };

        // NE PAS faire process.exit() ici !
        // Le serveur gère le timing après avoir sauvegardé le message

        return {
          success: true,
          message: `Redémarrage programmé: ${reason}. Le serveur va terminer la réponse puis redémarrer.`,
          needsRestart: true
        };
      }

      case 'consult_mistral': {
        if (!this.mistral) {
          return { success: false, error: 'Mistral API non configurée' };
        }

        const query = input.query as string;
        const context = input.context as string | undefined;
        const complexity = input.complexity as 'low' | 'medium' | 'high' | 'auto' | undefined;
        const forceModel = input.force_model as 'large' | 'medium' | 'small' | undefined;

        try {
          const result = await this.mistral.consult({
            query,
            context,
            complexity,
            forceModel
          });

          return {
            success: true,
            response: result.response,
            model_used: result.model,
            reasoning: result.reasoning,
            tokens: result.usage
          };
        } catch (error) {
          return { success: false, error: `Erreur Mistral: ${(error as Error).message}` };
        }
      }

      case 'switch_provider': {
        const provider = input.provider as ProviderType;

        // Valider le provider
        if (provider !== 'claude' && provider !== 'kimi') {
          return { success: false, error: `Provider inconnu: ${provider}. Utilise 'claude' ou 'kimi'.` };
        }

        // Changer le provider dans la config
        setActiveProvider(provider);

        // Stocker le flag pour que le Brain change de provider
        (global as any).__pendingProviderSwitch = provider;

        return {
          success: true,
          message: `Provider changé vers: ${provider}. Le prochain message utilisera ce provider.`,
          provider
        };
      }

      // web_search est la builtin function de Kimi pour la recherche web
      // On retourne simplement les arguments tels quels - Kimi exécute la recherche
      case 'web_search': {
        // Passthrough: Kimi a généré les arguments, on les retourne tels quels
        // Kimi exécutera la recherche web quand il recevra ce résultat
        // Le flag _webSearchPassthrough indique à server/index.ts de ne pas wrapper le résultat
        return {
          success: true,
          _webSearchPassthrough: true,
          arguments: input
        };
      }

      case 'get_kimi_balance': {
        try {
          const fs = await import('fs');
          const kimiKey = APIS.KIMI_API_KEY || (fs.existsSync(PATHS.KIMI_KEY_FILE) 
            ? fs.readFileSync(PATHS.KIMI_KEY_FILE, 'utf-8').trim()
            : '');
          
          if (!kimiKey) {
            return {
              success: false,
              error: 'Clé API Kimi non configurée'
            };
          }

          const response = await fetch('https://api.moonshot.ai/v1/users/me/balance', {
            headers: {
              'Authorization': `Bearer ${kimiKey}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            return {
              success: false,
              error: `API Error: ${response.status} - ${await response.text()}`
            };
          }

          const data = await response.json();
          
          if (data.code !== 0 || !data.status) {
            return {
              success: false,
              error: `API Error: code ${data.code}, scode ${data.scode}`
            };
          }

          return {
            success: true,
            available_balance: data.data.available_balance,
            voucher_balance: data.data.voucher_balance,
            cash_balance: data.data.cash_balance,
            currency: 'USD',
            message: `Solde disponible: ${data.data.available_balance.toFixed(2)} (Vouchers: ${data.data.voucher_balance.toFixed(2)}, Cash: ${data.data.cash_balance.toFixed(2)})`
          };
        } catch (error) {
          return {
            success: false,
            error: `Erreur: ${(error as Error).message}`
          };
        }
      }

      case 'todo': {
        const todo = getTodoManager();
        const action: any = { type: input.type };
        
        if (input.name) action.name = input.name;
        if (input.description) action.description = input.description;
        if (input.project_id) action.project_id = input.project_id;
        if (input.task_id) action.task_id = input.task_id;
        if (input.title) action.title = input.title;
        if (input.priority) action.priority = input.priority;
        if (input.status) action.status = input.status;
        if (input.task_ids) action.task_ids = input.task_ids;

        const result = todo.execute(action);

        // Format the response for better readability
        if (result.success) {
          if (action.type === 'list_projects' && result.projects) {
            const projects = result.projects.map((p: any) => 
              `[${p.id}] ${p.name} - ${p.completed_tasks}/${p.total_tasks} tasks`
            ).join('\n');
            return { success: true, projects: result.projects, message: projects || 'No projects' };
          }
          if (action.type === 'list_tasks' && result.tasks) {
            const tasks = result.tasks.map((t: any) => 
              `[${t.id}] ${t.status === 'completed' ? '✓' : '○'} ${t.title} (${t.priority})`
            ).join('\n');
            return { success: true, tasks: result.tasks, message: tasks || 'No tasks' };
          }
          if (action.type === 'create_project' && result.project) {
            return { success: true, project: result.project, message: `Created project "${result.project.name}" (ID: ${result.project.id})` };
          }
          if (action.type === 'create_task' && result.task) {
            return { success: true, task: result.task, message: `Created task "${result.task.title}" (ID: ${result.task.id})` };
          }
          if (action.type === 'complete_task' && result.task) {
            return { success: true, task: result.task, message: `Completed task "${result.task.title}"` };
          }
          if (result.data?.project) {
            const p = result.data.project;
            return { success: true, project: p, message: `Project: ${p.name}\nTasks: ${p.completed_tasks}/${p.total_tasks}` };
          }
        }

        return result;
      }

      default:
        return { success: false, error: `Outil inconnu: ${toolName}` };
    }
  }
}
