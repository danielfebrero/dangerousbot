import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 8,
  name: '008_create_projects_tasks',
  up(db) {
    // Check if projects table exists but lacks updated_at (needs recreation)
    const projectsTableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
    ).get();

    if (projectsTableExists) {
      const cols = db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[];
      if (!cols.some(c => c.name === 'updated_at')) {
        db.exec(`DROP TABLE IF EXISTS tasks`);
        db.exec(`DROP TABLE IF EXISTS projects`);
      }
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
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

    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  },
};

export default migration;
