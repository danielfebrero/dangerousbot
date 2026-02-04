import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 4,
  name: '004_create_knowledge_config_tables',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'context', 'skill')),
        content TEXT NOT NULL,
        embedding BLOB,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  },
};

export default migration;
