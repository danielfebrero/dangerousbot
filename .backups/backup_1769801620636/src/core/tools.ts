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
import { setActiveProvider, ProviderType, APIS, PATHS, PROVIDER } from '../config';
import { getTodoManager } from './todo';
import { getCodeEmbeddingService, CodeEmbeddingService } from './code-embedding';
import { getCodeIndexer } from './code-indexer';

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
      name: 'searxng_search',
      description: 'Effectue une recherche web privée via une instance SearxNG self-hosted, avec restriction per-query des sources autorisées (engines/categories). Retourne les résultats en JSON.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'La requête de recherche (obligatoire).' },
          engines: { type: 'string', description: 'Liste comma-separated des engines autorisés uniquement (ex: "google,bing,duckduckgo"). Laisse vide pour tous les engines configurés.' },
          categories: { type: 'string', description: 'Liste comma-separated des catégories autorisées (ex: "general,images,news").' },
          language: { type: 'string', description: "Code langue ISO (ex: 'fr-FR', 'en-US')." },
          time_range: { type: 'string', enum: ['day', 'month', 'year', null], description: 'Restriction temporelle pour engines compatibles.' },
          safesearch: { type: 'integer', enum: [0, 1, 2], description: 'Niveau safe search (0=none, 1=moderate, 2=strict).' },
          pageno: { type: 'integer', description: 'Numéro de page (default 1).', default: 1 }
        },
        required: ['query']
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
      description: 'Gère des projets et tâches TODO pour organiser le travail. IMPORTANT: Lors de la planification d\'une feature complexe, créer D\'ABORD toutes les tâches en batch (anticipation), puis les compléter au fur et à mesure. Usage: todo({type: "create_project", name: "nom"}) ou todo({type: "create_task", project_id: 1, title: "tâche"}) etc. Le système affiche visuellement les changements avec emojis et formatage markdown.',
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
    },
    {
      name: 'retrieve_code',
      description: 'Recherche sémantique dans la codebase de DangerousBot. Utilise les embeddings pour retrouver les fichiers et snippets de code les plus pertinents par rapport à une requête. Parfait pour trouver où est implémentée une fonctionnalité ou comprendre l\'architecture.',
      input_schema: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Description de ce que tu cherches (ex: "fonction qui gère les embeddings", "tool self_update", etc.)' 
          },
          top_k: { 
            type: 'number', 
            description: 'Nombre de résultats à retourner (défaut: 5)' 
          }
        },
        required: ['query']
      }
    }
  ];
}

/**
 * Récupère les outils disponibles pour un provider spécifique
 * Certains outils ne sont pas supportés par tous les providers
 */
export function getToolDefinitionsForProvider(provider: string | undefined = undefined): Tool[] {
  const allTools = getToolDefinitions();
  const activeProvider = provider || PROVIDER.ACTIVE;
  
  // Filtrer les outils selon le provider
  return allTools.filter(tool => {
    // web_search est uniquement pour Kimi
    if (tool.name === 'web_search') {
      return activeProvider === 'kimi';
    }
    // get_kimi_balance est uniquement pour Kimi
    if (tool.name === 'get_kimi_balance') {
      return activeProvider === 'kimi';
    }
    // Tous les autres outils sont disponibles pour tous les providers
    return true;
  });
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

          // Indexer les fichiers modifiés en arrière-plan
          try {
            const modifiedFiles = await rollbackManager.getModifiedFiles();
            const newFiles = await rollbackManager.getNewFiles();
            const deletedFiles = await rollbackManager.getDeletedFiles();
            const allChangedFiles = [...modifiedFiles, ...newFiles, ...deletedFiles];
            
            if (allChangedFiles.length > 0) {
              console.log(`[self_update] ${allChangedFiles.length} fichiers à ré-indexer`);
              const memory = getMemory();
              const embeddingService = getCodeEmbeddingService();
              const indexer = getCodeIndexer(process.cwd(), memory, embeddingService);
              
              // Lancer l'indexation en arrière-plan
              indexer.indexModifiedFiles(allChangedFiles).then(indexResult => {
                console.log(`[self_update] Indexation: ${indexResult.indexed} nouveaux, ${indexResult.updated} mis à jour, ${indexResult.deleted} supprimés`);
              }).catch(err => {
                console.warn('[self_update] Erreur indexation:', err);
              });
            }
          } catch (err) {
            console.warn('[self_update] Impossible d\'indexer les changements:', err);
          }

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

      case 'searxng_search': {
        try {
          const query = input.query as string;
          const engines = (input.engines as string) || 'google';
          const categories = (input.categories as string) || 'general';
          const language = (input.language as string) || 'fr-FR';
          const timeRange = input.time_range as string | undefined;
          const safeSearch = (input.safesearch as number) ?? 0;
          const pageNo = (input.pageno as number) || 1;

          const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';
          
          const params = new URLSearchParams({
            q: query,
            format: 'json',
            language: language,
            safesearch: safeSearch.toString(),
            pageno: pageNo.toString()
          });

          if (engines) {
            params.append('engines', engines);
          }
          if (categories) {
            params.append('categories', categories);
          }
          if (timeRange) {
            params.append('time_range', timeRange);
          }

          const response = await fetch(`${searxngUrl}/search?${params.toString()}`, {
            headers: {
              'Accept': 'application/json'
            }
          });

          if (!response.ok) {
            return {
              success: false,
              error: `SearxNG Error: ${response.status} - ${await response.text()}`
            };
          }

          const data = await response.json();
          
          // Formater les résultats
          const results = data.results?.map((r: any) => ({
            title: r.title,
            url: r.url,
            content: r.content,
            engine: r.engine,
            score: r.score
          })) || [];

          const formatted = results.slice(0, 10).map((r: any, i: number) => {
            return `**${i + 1}. ${r.title}**\n${r.url}\n${r.content?.substring(0, 200) || ''}${r.content?.length > 200 ? '...' : ''}`;
          }).join('\n\n');

          return {
            success: true,
            query: query,
            engines: engines,
            total_results: data.number_of_results || results.length,
            results: results.slice(0, 10),
            message: `## 🔍 Résultats pour: "${query}"\n\n*Moteurs: ${engines}*\n\n${formatted || 'Aucun résultat trouvé.'}`
          };
        } catch (error) {
          return {
            success: false,
            error: `Erreur SearxNG: ${(error as Error).message}`
          };
        }
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

        // Format the response with rich visual markdown
        if (result.success) {
          const formatPriority = (p: string) => {
            const emojis: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };
            return `${emojis[p] || '⚪'} ${p.toUpperCase()}`;
          };

          if (action.type === 'list_projects' && result.projects) {
            if (result.projects.length === 0) {
              return { success: true, projects: [], message: '📂 Aucun projet' };
            }
            const lines = result.projects.map((p: any) => {
              const progress = p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0;
              const bar = '█'.repeat(Math.round(progress / 10)) + '░'.repeat(10 - Math.round(progress / 10));
              return `\n**[${p.id}] ${p.name}**\n   ${bar} ${progress}% (${p.completed_tasks}/${p.total_tasks})\n   ${p.description || '_Pas de description_'}`;
            });
            return { success: true, projects: result.projects, message: `## 📊 Projets${lines.join('')}` };
          }

          if (action.type === 'list_tasks' && result.tasks) {
            if (result.tasks.length === 0) {
              return { success: true, tasks: [], message: '📝 Aucune tâche' };
            }
            const pending = result.tasks.filter((t: any) => t.status !== 'completed');
            const completed = result.tasks.filter((t: any) => t.status === 'completed');
            
            let msg = '## 📋 Tâches\n\n';
            if (pending.length > 0) {
              msg += '**⏳ En cours :**\n';
              msg += pending.map((t: any) => `   ☐ [${t.id}] ${t.title} ${formatPriority(t.priority)}`).join('\n');
              msg += '\n\n';
            }
            if (completed.length > 0) {
              msg += '**✅ Terminées :**\n';
              msg += completed.map((t: any) => `   ☑ [${t.id}] ~~${t.title}~~`).join('\n');
            }
            return { success: true, tasks: result.tasks, message: msg };
          }

          if (action.type === 'create_project' && result.project) {
            return { 
              success: true, 
              project: result.project, 
              message: `## 🆕 Projet créé\n\n**${result.project.name}** (ID: ${result.project.id})\n\n${result.project.description || ''}` 
            };
          }

          if (action.type === 'create_task' && result.task) {
            return { 
              success: true, 
              task: result.task, 
              message: `## ➕ Tâche ajoutée\n\n${formatPriority(result.task.priority)} **[${result.task.id}]** ${result.task.title}` 
            };
          }

          if (action.type === 'complete_task' && result.task) {
            const project = todo.execute({ type: 'get_project', project_id: result.task.project_id });
            const progress = project.data?.project ? 
              `${project.data.project.completed_tasks}/${project.data.project.total_tasks}` : '?';
            return { 
              success: true, 
              task: result.task, 
              message: `## ✅ Tâche complétée\n\n☑ ~~${result.task.title}~~\n\n*Progression du projet: ${progress}*` 
            };
          }

          if (action.type === 'delete_task' && result.task) {
            return { 
              success: true, 
              task: result.task, 
              message: `## 🗑️ Tâche supprimée\n\n~~${result.task.title}~~` 
            };
          }

          if (action.type === 'delete_project') {
            return { success: true, message: `## 🗑️ Projet supprimé` };
          }

          if (result.data?.project) {
            const p = result.data.project;
            const progress = p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0;
            return { 
              success: true, 
              project: p, 
              message: `## 📁 ${p.name}\n\n${p.description || '_Pas de description_'}\n\nProgression: ${progress}% (${p.completed_tasks}/${p.total_tasks})` 
            };
          }
        }

        return result;
      }

      case 'retrieve_code': {
        const query = input.query as string;
        const topK = (input.top_k as number) || 5;

        try {
          // Obtenir le service d'embedding
          let embeddingService: CodeEmbeddingService;
          try {
            embeddingService = getCodeEmbeddingService();
          } catch (e) {
            // Initialiser avec la clé Mistral si pas déjà fait
            const fs = await import('fs');
            const mistralKey = APIS.MISTRAL_API_KEY || (fs.existsSync(PATHS.MISTRAL_KEY_FILE) 
              ? fs.readFileSync(PATHS.MISTRAL_KEY_FILE, 'utf-8').trim()
              : '');
            
            if (!mistralKey) {
              return {
                success: false,
                error: 'Clé API Mistral non configurée (nécessaire pour les embeddings de code)'
              };
            }
            embeddingService = getCodeEmbeddingService();
          }

          // Générer l'embedding de la requête
          const queryEmbedding = await embeddingService.embedCode(query);

          // Récupérer tous les embeddings indexés
          const allEmbeddings = memory.getAllCodeEmbeddings();

          if (allEmbeddings.length === 0) {
            return {
              success: true,
              results: [],
              message: '📂 Aucun fichier indexé dans la base de données. Utilisez l\'indexation au démarrage.'
            };
          }

          // Calculer les similarités
          const scored = allEmbeddings.map(item => ({
            file_path: item.file_path,
            content: item.content,
            similarity: CodeEmbeddingService.cosineSimilarity(queryEmbedding.vector, item.embedding)
          }));

          // Trier et prendre les top_k
          const topResults = scored
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

          // Formater la réponse
          const lines = topResults.map((r, i) => {
            const pct = Math.round(r.similarity * 100);
            const preview = r.content.substring(0, 200).replace(/\n/g, ' ');
            return `**${i + 1}. ${r.file_path}** (${pct}% match)\n\`\`\`typescript\n${preview}${r.content.length > 200 ? '...' : ''}\n\`\`\``;
          });

          return {
            success: true,
            results: topResults,
            message: `## 🔍 Résultats pour: "${query}"\n\n${lines.join('\n\n')}`
          };
        } catch (error) {
          return {
            success: false,
            error: `Erreur lors de la recherche: ${(error as Error).message}`
          };
        }
      }

      default:
        return { success: false, error: `Outil inconnu: ${toolName}` };
    }
  }
}
