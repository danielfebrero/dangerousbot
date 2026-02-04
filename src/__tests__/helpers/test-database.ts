/**
 * Test Database Helper - Creates in-memory SQLite databases for testing
 */

import Database from 'better-sqlite3';
import { Migrator } from '../../database/migrator.js';
import { getAllMigrations } from '../../database/migrations/index.js';

/**
 * Creates a fresh in-memory SQLite database with all migrations applied.
 * Each call returns a new isolated database - no cleanup needed.
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  const migrator = new Migrator(db);
  migrator.run(getAllMigrations());
  return db;
}
