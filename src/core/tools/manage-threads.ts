/**
 * Tool: manage_threads - Gère les threads de conversation multiples
 *
 * Permet de lister, créer, supprimer et naviguer entre les threads.
 * Chaque thread est une conversation indépendante avec son propre historique.
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { getThreadManager } from '../thread-manager.js';
import { getMemory } from '../memory.js';

export const manageThreadsDefinition: Tool = {
  name: 'manage_threads',
  description: `Gère les threads de conversation multiples.

Actions disponibles:
- list: Liste tous les threads avec leurs métadonnées
- get: Récupère les détails d'un thread (messages inclus)
- create: Crée un nouveau thread
- create_sub: Crée un sous-thread d'un thread existant
- switch: Change le thread actif pour la conversation en cours
- exit: Quitte le thread actuel pour revenir au thread parent
- rename: Renomme un thread
- delete: Supprime un thread et tous ses messages
- clear: Efface les messages d'un thread sans le supprimer

Un thread est une conversation indépendante avec son propre historique.
Les sous-threads permettent de créer des discussions enfants d'un thread parent.`,
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'create', 'create_sub', 'switch', 'exit', 'rename', 'delete', 'clear'],
        description: 'Action à effectuer sur les threads'
      },
      thread_id: {
        type: 'string',
        description: 'ID du thread (requis pour get, switch, rename, delete, clear)'
      },
      parent_thread_id: {
        type: 'string',
        description: 'ID du thread parent (pour create_sub)'
      },
      title: {
        type: 'string',
        description: 'Titre du thread (pour create, create_sub, rename)'
      },
      include_sub_threads: {
        type: 'boolean',
        description: 'Inclure les sous-threads dans la liste (pour list)'
      }
    },
    required: ['action']
  }
};

export const manageThreadsHandler: ToolHandler = {
  name: 'manage_threads',
  definition: manageThreadsDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const threadManager = getThreadManager();
    const memory = getMemory();
    const action = input.action as 'list' | 'get' | 'create' | 'create_sub' | 'switch' | 'exit' | 'rename' | 'delete' | 'clear';

    // Helper pour persister le thread actif si c'est Telegram
    const persistThreadForTelegram = (threadId: string) => {
      if (context.source === 'telegram' && context.telegramUserId) {
        memory.setTelegramActiveThread(context.telegramUserId, threadId);
        console.log(`[manage_threads] Thread ${threadId} persisté pour Telegram user ${context.telegramUserId}`);
      }
    };

    try {
      switch (action) {
        case 'list': {
          const includeSubThreads = input.include_sub_threads !== false;
          const threads = threadManager.listThreads(includeSubThreads);
          const stats = threadManager.getStats();

          return {
            success: true,
            threads: threads.map((t: any) => ({
              id: t.id,
              title: t.title,
              is_main: t.isMain,
              parent_thread_id: t.parentThreadId,
              source: t.source,
              created_at: t.createdAt,
              updated_at: t.updatedAt,
            })),
            stats: {
              total_threads: stats.totalThreads,
              total_messages: stats.totalMessages,
            },
          };
        }

        case 'get': {
          const getThreadId = input.thread_id as string;
          if (!getThreadId) {
            return {
              success: false,
              error: 'thread_id est requis pour l\'action get',
            };
          }

          const thread = threadManager.getThread(getThreadId);
          if (!thread) {
            return {
              success: false,
              error: `Thread ${getThreadId} non trouvé`,
            };
          }

          const messages = threadManager.getThreadMessages(getThreadId);
          const subThreads = threadManager.getSubThreads(getThreadId);

          return {
            success: true,
            thread: {
              id: thread.id,
              title: thread.title,
              is_main: thread.isMain,
              parent_thread_id: thread.parentThreadId,
              source: thread.source,
              created_at: thread.createdAt,
              updated_at: thread.updatedAt,
            },
            messages: messages.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
              has_images: !!m.images && m.images.length > 0,
              has_tool_calls: !!m.toolCalls && m.toolCalls.length > 0,
            })),
            sub_threads: subThreads.map((t: any) => ({
              id: t.id,
              title: t.title,
              created_at: t.createdAt,
            })),
            message_count: messages.length,
          };
        }

        case 'create': {
          const title = (input.title as string) || 'New Thread';
          const newThreadId = threadManager.createThread(title, null, false, 'webapp');
          const newThread = threadManager.getThread(newThreadId);

          return {
            success: true,
            thread: {
              id: newThread!.id,
              title: newThread!.title,
              created_at: newThread!.createdAt,
            },
            message: `Thread "${title}" créé avec succès`,
          };
        }

        case 'create_sub': {
          const parentId = input.parent_thread_id as string;
          const subTitle = (input.title as string) || 'Sub Thread';

          if (!parentId) {
            return {
              success: false,
              error: 'parent_thread_id est requis pour créer un sous-thread',
            };
          }

          const parent = threadManager.getThread(parentId);
          if (!parent) {
            return {
              success: false,
              error: `Thread parent ${parentId} non trouvé`,
            };
          }

          const subThreadId = threadManager.createSubThread(parentId, subTitle);
          const subThread = threadManager.getThread(subThreadId);

          return {
            success: true,
            thread: {
              id: subThread!.id,
              title: subThread!.title,
              parent_thread_id: parentId,
              created_at: subThread!.createdAt,
            },
            message: `Sous-thread "${subTitle}" créé sous "${parent.title}"`,
          };
        }

        case 'switch': {
          const switchThreadId = input.thread_id as string;
          if (!switchThreadId) {
            return {
              success: false,
              error: 'thread_id est requis pour switch',
            };
          }

          const thread = threadManager.getThread(switchThreadId);
          if (!thread) {
            return {
              success: false,
              error: `Thread ${switchThreadId} non trouvé`,
            };
          }

          // Persister le thread pour Telegram
          persistThreadForTelegram(switchThreadId);

          // Note: Le switch réel se fait via WebSocket pour le client spécifique
          // Cette action retourne juste les infos pour confirmation
          return {
            success: true,
            thread: {
              id: thread.id,
              title: thread.title,
              message_count: threadManager.getThreadMessages(switchThreadId).length,
            },
            message: `Thread actif changé vers "${thread.title}"`,
          };
        }

        case 'exit': {
          // Récupère le thread_id courant depuis le contexte ou l'input
          const currentThreadId = input.thread_id as string;
          if (!currentThreadId) {
            return {
              success: false,
              error: 'thread_id est requis pour exit (ID du thread actuel)',
            };
          }

          const currentThread = threadManager.getThread(currentThreadId);
          if (!currentThread) {
            return {
              success: false,
              error: `Thread ${currentThreadId} non trouvé`,
            };
          }

          // Vérifie si le thread a un parent
          if (!currentThread.parentThreadId) {
            return {
              success: false,
              error: `Le thread "${currentThread.title}" n'a pas de thread parent (c'est un thread principal)`,
            };
          }

          const parentThread = threadManager.getThread(currentThread.parentThreadId);
          if (!parentThread) {
            return {
              success: false,
              error: `Thread parent ${currentThread.parentThreadId} non trouvé`,
            };
          }

          // Persister le thread parent pour Telegram
          persistThreadForTelegram(parentThread.id);

          // Retourne les infos du parent pour le switch
          return {
            success: true,
            previous_thread: {
              id: currentThread.id,
              title: currentThread.title,
            },
            thread: {
              id: parentThread.id,
              title: parentThread.title,
              message_count: threadManager.getThreadMessages(parentThread.id).length,
            },
            message: `Retour au thread parent "${parentThread.title}"`,
          };
        }

        case 'rename': {
          const renameThreadId = input.thread_id as string;
          const newTitle = input.title as string;

          if (!renameThreadId || !newTitle) {
            return {
              success: false,
              error: 'thread_id et title sont requis pour rename',
            };
          }

          const renamed = threadManager.renameThread(renameThreadId, newTitle);
          if (renamed) {
            return {
              success: true,
              message: `Thread renommé en "${newTitle}"`,
            };
          } else {
            return {
              success: false,
              error: `Thread ${renameThreadId} non trouvé`,
            };
          }
        }

        case 'delete': {
          const deleteThreadId = input.thread_id as string;
          if (!deleteThreadId) {
            return {
              success: false,
              error: 'thread_id est requis pour delete',
            };
          }

          const thread = threadManager.getThread(deleteThreadId);
          if (!thread) {
            return {
              success: false,
              error: `Thread ${deleteThreadId} non trouvé`,
            };
          }

          const deleted = threadManager.deleteThread(deleteThreadId);
          if (deleted) {
            return {
              success: true,
              message: `Thread "${thread.title}" et tous ses sous-threads supprimés`,
            };
          } else {
            return {
              success: false,
              error: `Impossible de supprimer le thread ${deleteThreadId}`,
            };
          }
        }

        case 'clear': {
          const clearThreadId = input.thread_id as string;
          if (!clearThreadId) {
            return {
              success: false,
              error: 'thread_id est requis pour clear',
            };
          }

          threadManager.clearThreadMessages(clearThreadId);
          return {
            success: true,
            message: `Messages du thread ${clearThreadId} effacés`,
          };
        }

        default:
          return {
            success: false,
            error: `Action inconnue: ${action}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: `Erreur gestion threads: ${(error as Error).message}`,
      };
    }
  },
};
