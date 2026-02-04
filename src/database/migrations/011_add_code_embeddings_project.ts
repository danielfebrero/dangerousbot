import type { Migration } from '../migrator.js';

const migration: Migration = {
  id: 11,
  name: '011_add_code_embeddings_project',
  up(db) {
    try {
      db.exec(`ALTER TABLE code_embeddings ADD COLUMN project_name TEXT DEFAULT 'dangerousbot'`);
    } catch {
      // Column already exists
    }

    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_code_embeddings_project ON code_embeddings(project_name)`);
    } catch {
      // Index exists
    }
  },
};

export default migration;
