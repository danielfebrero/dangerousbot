import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 6,
  name: '006_add_conversations_columns',
  up(db) {
    const addColumn = (table: string, column: string, definition: string) => {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      } catch {
        // Column already exists
      }
    };

    addColumn('conversations', 'tool_calls', 'TEXT');
    addColumn('conversations', 'images', 'TEXT');
    addColumn('conversations', 'source', "TEXT CHECK(source IN ('webapp', 'telegram'))");
    addColumn('conversations', 'compressed', 'INTEGER DEFAULT 0');
    addColumn('conversations', 'embedding', 'BLOB');

    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_compressed ON conversations(compressed)`);
    } catch {
      // Index exists
    }

    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source)`);
    } catch {
      // Index exists
    }
  },
};

export default migration;
