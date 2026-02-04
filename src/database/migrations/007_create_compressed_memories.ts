import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 7,
  name: '007_create_compressed_memories',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS compressed_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        message_ids TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        embedding BLOB,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_compressed_session ON compressed_memories(session_id);
    `);

    // Add thread_id column if not present
    try {
      const columns = db.prepare(`PRAGMA table_info(compressed_memories)`).all() as Array<{ name: string }>;
      const hasThreadId = columns.some((col: { name: string }) => col.name === 'thread_id');
      if (!hasThreadId) {
        db.exec(`ALTER TABLE compressed_memories ADD COLUMN thread_id TEXT`);
      }
    } catch {
      // Column may already exist
    }

    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_compressed_thread ON compressed_memories(thread_id)`);
    } catch {
      // Index exists or column missing
    }
  },
};

export default migration;
