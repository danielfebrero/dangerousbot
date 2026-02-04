import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 2,
  name: '002_create_conversations_table',
  up(db) {
    // Check if conversations table exists without thread_id (legacy migration)
    const tableInfo = db.prepare(`PRAGMA table_info(conversations)`).all() as Array<{ name: string }>;
    const hasThreadId = tableInfo.some(col => col.name === 'thread_id');

    if (tableInfo.length > 0 && !hasThreadId) {
      // Legacy DB: add thread_id column and migrate existing messages
      const mainThreadId = `thread_main_${Date.now()}`;
      db.prepare(`INSERT OR IGNORE INTO threads (id, title, is_main) VALUES (?, ?, ?)`).run(mainThreadId, 'Main Thread', 1);
      db.exec(`ALTER TABLE conversations ADD COLUMN thread_id TEXT`);
      db.prepare(`UPDATE conversations SET thread_id = ? WHERE thread_id IS NULL`).run(mainThreadId);
    }

    // Create table (IF NOT EXISTS won't alter an existing table)
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
    `);

    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_thread ON conversations(thread_id)`);
    } catch {
      // Index exists or column not present
    }
  },
};

export default migration;
