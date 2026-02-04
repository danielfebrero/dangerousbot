/**
 * Unit tests for todo tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { todoHandler } from '../../todo.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';

const { mockTodoManager } = vi.hoisted(() => ({
  mockTodoManager: {
    execute: vi.fn(),
  },
}));

vi.mock('../../../todo.js', () => ({
  getTodoManager: vi.fn(() => mockTodoManager),
}));

describe('todo tool', () => {
  let ctx: ReturnType<typeof createMockToolContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have name "todo"', () => {
      expect(todoHandler.name).toBe('todo');
    });

    it('should have a definition with input_schema', () => {
      expect(todoHandler.definition).toBeDefined();
      expect(todoHandler.definition.name).toBe('todo');
      expect(todoHandler.definition.input_schema).toBeDefined();
      expect(todoHandler.definition.input_schema.required).toContain('type');
    });
  });

  describe('execute', () => {
    describe('list_projects', () => {
      it('should return empty list when no projects exist', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: { projects: [] },
        });

        const result = await todoHandler.execute({ type: 'list_projects' }, ctx);

        expect(result.success).toBe(true);
        expect(result.projects).toEqual([]);
        expect(result.message).toContain('Aucun projet');
      });

      it('should return formatted projects with progress bars', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: {
            projects: [
              { id: 1, name: 'Project Alpha', description: 'First project', completed_tasks: 3, total_tasks: 5 },
              { id: 2, name: 'Project Beta', description: null, completed_tasks: 0, total_tasks: 4 },
            ],
          },
        });

        const result = await todoHandler.execute({ type: 'list_projects' }, ctx);

        expect(result.success).toBe(true);
        expect(result.projects).toHaveLength(2);
        expect(result.message).toContain('Project Alpha');
        expect(result.message).toContain('Project Beta');
        expect(result.message).toContain('60%');
        expect(result.message).toContain('3/5');
        expect(result.message).toContain('0%');
        expect(result.message).toContain('0/4');
        // Check progress bar characters
        expect(result.message).toContain('█');
        expect(result.message).toContain('░');
      });
    });

    describe('list_tasks', () => {
      it('should return empty list when no tasks exist', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: { tasks: [] },
        });

        const result = await todoHandler.execute({ type: 'list_tasks', project_id: 1 }, ctx);

        expect(result.success).toBe(true);
        expect(result.tasks).toEqual([]);
        expect(result.message).toContain('Aucune tâche');
      });

      it('should return formatted tasks with pending and completed sections', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: {
            tasks: [
              { id: 1, title: 'Setup database', status: 'pending', priority: 'high' },
              { id: 2, title: 'Write tests', status: 'pending', priority: 'medium' },
              { id: 3, title: 'Init project', status: 'completed', priority: 'low' },
            ],
          },
        });

        const result = await todoHandler.execute({ type: 'list_tasks', project_id: 1 }, ctx);

        expect(result.success).toBe(true);
        expect(result.tasks).toHaveLength(3);
        expect(result.message).toContain('En cours');
        expect(result.message).toContain('Terminées');
        expect(result.message).toContain('Setup database');
        expect(result.message).toContain('Write tests');
        expect(result.message).toContain('Init project');
        // Check priority formatting
        expect(result.message).toContain('HIGH');
        expect(result.message).toContain('MEDIUM');
        // Completed tasks are shown with strikethrough
        expect(result.message).toContain('~~Init project~~');
      });
    });

    describe('create_project', () => {
      it('should return formatted project creation', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: {
            project: { id: 1, name: 'New Project', description: 'A new project' },
          },
        });

        const result = await todoHandler.execute({
          type: 'create_project',
          name: 'New Project',
          description: 'A new project',
        }, ctx);

        expect(result.success).toBe(true);
        expect(result.project).toBeDefined();
        expect(result.project.id).toBe(1);
        expect(result.project.name).toBe('New Project');
        expect(result.message).toContain('Projet créé');
        expect(result.message).toContain('New Project');
        expect(result.message).toContain('ID: 1');
        expect(result.message).toContain('A new project');
      });
    });

    describe('create_task', () => {
      it('should return formatted task creation', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: {
            task: { id: 5, title: 'Implement feature', project_id: 1, priority: 'high', status: 'pending' },
          },
        });

        const result = await todoHandler.execute({
          type: 'create_task',
          project_id: 1,
          title: 'Implement feature',
          priority: 'high',
        }, ctx);

        expect(result.success).toBe(true);
        expect(result.task).toBeDefined();
        expect(result.task.id).toBe(5);
        expect(result.message).toContain('Tâche ajoutée');
        expect(result.message).toContain('Implement feature');
        expect(result.message).toContain('[5]');
        expect(result.message).toContain('HIGH');
      });
    });

    describe('complete_task', () => {
      it('should return formatted completion with project progress', async () => {
        mockTodoManager.execute
          .mockReturnValueOnce({
            success: true,
            data: {
              task: { id: 1, title: 'Setup database', project_id: 1, priority: 'medium', status: 'completed' },
            },
          })
          .mockReturnValueOnce({
            success: true,
            data: {
              project: { completed_tasks: 1, total_tasks: 3 },
            },
          });

        const result = await todoHandler.execute({ type: 'complete_task', task_id: 1 }, ctx);

        expect(result.success).toBe(true);
        expect(result.task).toBeDefined();
        expect(result.task.status).toBe('completed');
        expect(result.message).toContain('Tâche complétée');
        expect(result.message).toContain('~~Setup database~~');
        expect(result.message).toContain('1/3');
        // Second call to get_project
        expect(mockTodoManager.execute).toHaveBeenCalledTimes(2);
        expect(mockTodoManager.execute).toHaveBeenLastCalledWith({ type: 'get_project', project_id: 1 });
      });
    });

    describe('delete_task', () => {
      it('should return formatted task deletion', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: {
            task: { id: 2, title: 'Old task', project_id: 1, priority: 'low', status: 'pending' },
          },
        });

        const result = await todoHandler.execute({ type: 'delete_task', task_id: 2 }, ctx);

        expect(result.success).toBe(true);
        expect(result.task).toBeDefined();
        expect(result.message).toContain('Tâche supprimée');
        expect(result.message).toContain('~~Old task~~');
      });
    });

    describe('delete_project', () => {
      it('should return success message', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: {},
        });

        const result = await todoHandler.execute({ type: 'delete_project', project_id: 1 }, ctx);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Projet supprimé');
      });
    });

    describe('get_project', () => {
      it('should return formatted project info', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: {
            project: {
              id: 1,
              name: 'My Project',
              description: 'Project description',
              completed_tasks: 2,
              total_tasks: 5,
            },
          },
        });

        const result = await todoHandler.execute({ type: 'get_project', project_id: 1 }, ctx);

        expect(result.success).toBe(true);
        expect(result.project).toBeDefined();
        expect(result.project.name).toBe('My Project');
        expect(result.message).toContain('My Project');
        expect(result.message).toContain('Project description');
        expect(result.message).toContain('40%');
        expect(result.message).toContain('2/5');
      });
    });

    describe('input passthrough', () => {
      it('should pass through all input fields to the action', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: { tasks: [] },
        });

        await todoHandler.execute({
          type: 'list_tasks',
          project_id: 42,
          status: 'pending',
        }, ctx);

        expect(mockTodoManager.execute).toHaveBeenCalledWith({
          type: 'list_tasks',
          project_id: 42,
          status: 'pending',
        });
      });

      it('should pass task_ids for reorder_tasks', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: {},
        });

        await todoHandler.execute({
          type: 'reorder_tasks',
          project_id: 1,
          task_ids: [3, 1, 2],
        }, ctx);

        expect(mockTodoManager.execute).toHaveBeenCalledWith({
          type: 'reorder_tasks',
          project_id: 1,
          task_ids: [3, 1, 2],
        });
      });

      it('should pass name and description for create_project', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: {
            project: { id: 10, name: 'Test', description: 'Desc' },
          },
        });

        await todoHandler.execute({
          type: 'create_project',
          name: 'Test',
          description: 'Desc',
        }, ctx);

        expect(mockTodoManager.execute).toHaveBeenCalledWith({
          type: 'create_project',
          name: 'Test',
          description: 'Desc',
        });
      });

      it('should pass title and priority for create_task', async () => {
        mockTodoManager.execute.mockReturnValue({
          success: true,
          data: {
            task: { id: 1, title: 'Task', project_id: 1, priority: 'high', status: 'pending' },
          },
        });

        await todoHandler.execute({
          type: 'create_task',
          project_id: 1,
          title: 'Task',
          priority: 'high',
        }, ctx);

        expect(mockTodoManager.execute).toHaveBeenCalledWith({
          type: 'create_task',
          project_id: 1,
          title: 'Task',
          priority: 'high',
        });
      });
    });

    describe('error handling', () => {
      it('should return the raw result when success is false', async () => {
        const errorResult = {
          success: false,
          error: 'Project not found',
        };
        mockTodoManager.execute.mockReturnValue(errorResult);

        const result = await todoHandler.execute({ type: 'get_project', project_id: 999 }, ctx);

        expect(result).toEqual(errorResult);
      });
    });
  });
});
