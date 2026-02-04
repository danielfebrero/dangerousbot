import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 5,
  name: '005_create_telegram_tool_tables',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_master (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        user_id INTEGER,
        username TEXT,
        set_at TEXT DEFAULT (datetime('now'))
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_call_id TEXT NOT NULL UNIQUE,
        tool_name TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success', 'error')),
        input TEXT NOT NULL,
        output TEXT NOT NULL,
        error TEXT,
        execution_time_ms INTEGER,
        thread_id TEXT NOT NULL,
        message_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tool_executions_thread ON tool_executions(thread_id);
      CREATE INDEX IF NOT EXISTS idx_tool_executions_timestamp ON tool_executions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_call_id ON tool_executions(tool_call_id);
    `);
  },
};

export default migration;
