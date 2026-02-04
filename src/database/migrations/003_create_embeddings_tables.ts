import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 3,
  name: '003_create_embeddings_tables',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER,
        vector BLOB,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS code_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding BLOB NOT NULL,
        token_count INTEGER,
        file_size INTEGER,
        last_modified TEXT,
        indexed_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_code_embeddings_path ON code_embeddings(file_path);
      CREATE INDEX IF NOT EXISTS idx_code_embeddings_hash ON code_embeddings(content_hash);
    `);
  },
};

export default migration;
