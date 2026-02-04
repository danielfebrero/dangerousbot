import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 9,
  name: '009_create_consultant_tables',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS consultant_conversations (
        id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_consultant_conv_updated ON consultant_conversations(updated_at);
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS consultant_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        model TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES consultant_conversations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_consultant_msg_conv ON consultant_messages(conversation_id);
    `);
  },
};

export default migration;
