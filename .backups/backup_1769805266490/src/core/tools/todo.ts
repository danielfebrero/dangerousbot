//**
 * Tool: todo - Gestion des projets et tâches
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { getTodoManager } from '../todo';

export const todoDefinition: Tool = {
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
};

export const todoHandler: ToolHandler = {
  name: 'todo',
  definition: todoDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
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
};
