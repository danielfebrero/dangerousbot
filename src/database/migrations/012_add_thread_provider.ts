import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 12,
  name: '012_add_thread_provider',
  up(db) {
    try {
      db.exec(`ALTER TABLE threads ADD COLUMN provider TEXT DEFAULT NULL`);
    } catch {
      // Column already exists
    }
  },
};

export default migration;
