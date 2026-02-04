import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 10,
  name: '010_create_files_table',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT,
        mime_type TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'webapp',
        telegram_chat_id TEXT,
        downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        accessed_at DATETIME,
        deleted_at DATETIME,
        is_deleted INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_files_downloaded_at ON files(downloaded_at);
      CREATE INDEX IF NOT EXISTS idx_files_is_deleted ON files(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_files_source ON files(source);
    `);

    // Default config values for storage limits
    db.exec(`
      INSERT OR IGNORE INTO config (key, value) VALUES ('storage_limit_bytes', '1073741824');
      INSERT OR IGNORE INTO config (key, value) VALUES ('storage_limit_gb', '1');
    `);
  },
};

export default migration;
