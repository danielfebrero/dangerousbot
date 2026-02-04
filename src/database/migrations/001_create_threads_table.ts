import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 1,
  name: '001_create_threads_table',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        parent_thread_id TEXT,
        title TEXT,
        is_main BOOLEAN DEFAULT 1,
        source TEXT CHECK(source IN ('webapp', 'telegram')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (parent_thread_id) REFERENCES threads(id)
      );
      CREATE INDEX IF NOT EXISTS idx_threads_parent ON threads(parent_thread_id);
      CREATE INDEX IF NOT EXISTS idx_threads_is_main ON threads(is_main);
    `);
  },
};

export default migration;
