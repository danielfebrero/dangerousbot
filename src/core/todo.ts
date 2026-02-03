/**
 * Todo - Système de gestion de projets et tâches
 * Stockage SQLite avec deux tables: projects et tasks
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Database path - use the main dangerousbot.db
const DATA_DIR = path.join(os.homedir(), '.dangerousbot', 'data');
const DB_PATH = path.join(DATA_DIR, 'dangerousbot.db');

// Types
export interface Project {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  total_tasks: number;
  completed_tasks: number;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed';
  created_at: string;
  completed_at: string | null;
  order_index: number;
}

export type TodoAction = 
  | { type: 'create_project'; name: string; description?: string }
  | { type: 'delete_project'; project_id: number }
  | { type: 'list_projects' }
  | { type: 'create_task'; project_id: number; title: string; description?: string; priority?: 'low' | 'medium' | 'high' }
  | { type: 'complete_task'; task_id: number }
  | { type: 'uncomplete_task'; task_id: number }
  | { type: 'delete_task'; task_id: number }
  | { type: 'list_tasks'; project_id: number; status?: 'all' | 'pending' | 'completed' }
  | { type: 'get_project'; project_id: number }
  | { type: 'reorder_tasks'; project_id: number; task_ids: number[] };

export class TodoManager {
  private db: Database.Database;

  constructor() {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Use the main dangerousbot.db database
    this.db = new Database(DB_PATH);
    this.initTables();
  }

  private initTables(): void {
    // Check if projects table exists and needs migration
    const projectsTableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
    ).get();
    
    if (projectsTableExists) {
      const projectTableInfo = this.db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[];
      const hasUpdatedAtColumn = projectTableInfo.some(col => col.name === 'updated_at');
      
      if (!hasUpdatedAtColumn) {
        // Drop and recreate tables with correct schema
        this.db.exec(`DROP TABLE IF EXISTS tasks`);
        this.db.exec(`DROP TABLE IF EXISTS projects`);
      }
    }

    // Projects table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        order_index INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Indexes for performance
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  }

  // Project operations
  createProject(name: string, description?: string): { success: boolean; project?: Project; error?: string } {
    try {
      // Check if project exists
      const existing = this.db.prepare('SELECT id FROM projects WHERE name = ?').get(name);
      if (existing) {
        return { success: false, error: `Project "${name}" already exists` };
      }

      const stmt = this.db.prepare(
        'INSERT INTO projects (name, description) VALUES (?, ?)'
      );
      const result = stmt.run(name, description || null);
      
      const project = this.getProject(result.lastInsertRowid as number);
      return { success: true, project };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  deleteProject(projectId: number): { success: boolean; error?: string } {
    try {
      const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
      const result = stmt.run(projectId);
      
      if (result.changes === 0) {
        return { success: false, error: `Project ${projectId} not found` };
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  getProject(projectId: number): Project | undefined {
    const stmt = this.db.prepare(`
      SELECT 
        p.*,
        COUNT(t.id) as total_tasks,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE p.id = ?
      GROUP BY p.id
    `);
    return stmt.get(projectId) as Project | undefined;
  }

  listProjects(): { success: boolean; projects?: Project[]; error?: string } {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          p.*,
          COUNT(t.id) as total_tasks,
          SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id AND t.status != 'completed'
        GROUP BY p.id
        ORDER BY p.updated_at DESC
      `);
      const projects = stmt.all() as Project[];
      return { success: true, projects };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Task operations
  createTask(
    projectId: number, 
    title: string, 
    description?: string, 
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): { success: boolean; task?: Task; error?: string } {
    try {
      // Verify project exists
      const project = this.getProject(projectId);
      if (!project) {
        return { success: false, error: `Project ${projectId} not found` };
      }

      // Get max order_index for this project
      const orderStmt = this.db.prepare('SELECT MAX(order_index) as max_order FROM tasks WHERE project_id = ?');
      const orderResult = orderStmt.get(projectId) as { max_order: number | null };
      const orderIndex = (orderResult.max_order || 0) + 1;

      const stmt = this.db.prepare(
        'INSERT INTO tasks (project_id, title, description, priority, order_index) VALUES (?, ?, ?, ?, ?)'
      );
      const result = stmt.run(projectId, title, description || null, priority, orderIndex);

      // Update project updated_at
      this.db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(projectId);

      const task = this.getTask(result.lastInsertRowid as number);
      return { success: true, task };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  completeTask(taskId: number): { success: boolean; task?: Task; error?: string } {
    try {
      const stmt = this.db.prepare(`
        UPDATE tasks 
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      const result = stmt.run(taskId);

      if (result.changes === 0) {
        return { success: false, error: `Task ${taskId} not found` };
      }

      const task = this.getTask(taskId);
      if (task) {
        // Update project updated_at
        this.db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(task.project_id);
      }

      return { success: true, task };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  uncompleteTask(taskId: number): { success: boolean; task?: Task; error?: string } {
    try {
      const stmt = this.db.prepare(`
        UPDATE tasks 
        SET status = 'pending', completed_at = NULL 
        WHERE id = ?
      `);
      const result = stmt.run(taskId);

      if (result.changes === 0) {
        return { success: false, error: `Task ${taskId} not found` };
      }

      const task = this.getTask(taskId);
      if (task) {
        // Update project updated_at
        this.db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(task.project_id);
      }

      return { success: true, task };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  deleteTask(taskId: number): { success: boolean; error?: string } {
    try {
      const task = this.getTask(taskId);
      if (!task) {
        return { success: false, error: `Task ${taskId} not found` };
      }

      const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
      stmt.run(taskId);

      // Update project updated_at
      this.db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(task.project_id);

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  getTask(taskId: number): Task | undefined {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    return stmt.get(taskId) as Task | undefined;
  }

  listTasks(
    projectId: number, 
    status: 'all' | 'pending' | 'completed' = 'all'
  ): { success: boolean; tasks?: Task[]; error?: string } {
    try {
      let query = 'SELECT * FROM tasks WHERE project_id = ?';
      const params: (number | string)[] = [projectId];

      if (status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY order_index ASC, created_at ASC';

      const stmt = this.db.prepare(query);
      const tasks = stmt.all(...params) as Task[];
      return { success: true, tasks };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  reorderTasks(projectId: number, taskIds: number[]): { success: boolean; error?: string } {
    try {
      const updateStmt = this.db.prepare('UPDATE tasks SET order_index = ? WHERE id = ? AND project_id = ?');
      
      this.db.transaction(() => {
        taskIds.forEach((taskId, index) => {
          updateStmt.run(index, taskId, projectId);
        });
      })();

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Main execute method for tool integration
  execute(action: TodoAction): { success: boolean; data?: any; error?: string } {
    switch (action.type) {
      case 'create_project':
        return this.createProject(action.name, action.description);

      case 'delete_project':
        return this.deleteProject(action.project_id);

      case 'list_projects':
        return this.listProjects();

      case 'create_task':
        return this.createTask(
          action.project_id, 
          action.title, 
          action.description, 
          action.priority
        );

      case 'complete_task':
        return this.completeTask(action.task_id);

      case 'uncomplete_task':
        return this.uncompleteTask(action.task_id);

      case 'delete_task':
        return this.deleteTask(action.task_id);

      case 'list_tasks':
        return this.listTasks(action.project_id, action.status);

      case 'get_project':
        const project = this.getProject(action.project_id);
        return project 
          ? { success: true, data: { project } }
          : { success: false, error: `Project ${action.project_id} not found` };

      case 'reorder_tasks':
        return this.reorderTasks(action.project_id, action.task_ids);

      default:
        return { success: false, error: 'Unknown action type' };
    }
  }
}

// Singleton instance
let todoManager: TodoManager | null = null;

export function getTodoManager(): TodoManager {
  if (!todoManager) {
    todoManager = new TodoManager();
  }
  return todoManager;
}

export function resetTodoManager(): void {
  todoManager = null;
}
