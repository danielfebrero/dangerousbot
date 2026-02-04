/**
 * Database - Central database singleton with migration support
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { Migrator } from './migrator.js';
import { getAllMigrations } from './migrations/index.js';
import { logger } from '../core/logger.js';

const DATA_DIR = path.join(os.homedir(), '.dangerousbot', 'data');
const DB_PATH = path.join(DATA_DIR, 'dangerousbot.db');

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }

    dbInstance = new Database(DB_PATH);

    const migrator = new Migrator(dbInstance);
    migrator.run(getAllMigrations());

    logger.info('Database', 'Database initialized and migrations applied.');
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
