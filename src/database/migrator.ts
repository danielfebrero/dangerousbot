/**
 * Database Migrator - Tracks and applies schema migrations
 */

import Database from 'better-sqlite3';
import { logger } from '../core/logger.js';

export interface Migration {
  id: number;
  name: string;
  up(db: Database.Database): void;
}

export class Migrator {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureMigrationsTable();
  }

  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  private getAppliedMigrations(): Set<number> {
    const rows = this.db.prepare(
      'SELECT id FROM schema_migrations ORDER BY id'
    ).all() as { id: number }[];
    return new Set(rows.map(r => r.id));
  }

  run(migrations: Migration[]): void {
    const applied = this.getAppliedMigrations();
    const sorted = [...migrations].sort((a, b) => a.id - b.id);

    for (const migration of sorted) {
      if (applied.has(migration.id)) {
        continue;
      }

      logger.info('Migrator', `Applying migration ${migration.name}...`);

      this.db.transaction(() => {
        migration.up(this.db);
        this.db.prepare(
          'INSERT INTO schema_migrations (id, name) VALUES (?, ?)'
        ).run(migration.id, migration.name);
      })();

      logger.info('Migrator', `Migration ${migration.name} applied.`);
    }
  }
}
