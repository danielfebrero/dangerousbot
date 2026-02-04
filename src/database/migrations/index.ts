import type { Migration } from '../migrator.js';

import m001 from './001_create_threads_table.js';
import m002 from './002_create_conversations_table.js';
import m003 from './003_create_embeddings_tables.js';
import m004 from './004_create_knowledge_config_tables.js';
import m005 from './005_create_telegram_tool_tables.js';
import m006 from './006_add_conversations_columns.js';
import m007 from './007_create_compressed_memories.js';
import m008 from './008_create_projects_tasks.js';
import m009 from './009_create_consultant_tables.js';
import m010 from './010_create_files_table.js';
import m011 from './011_add_code_embeddings_project.js';
import m012 from './012_add_thread_provider.js';

export function getAllMigrations(): Migration[] {
  return [m001, m002, m003, m004, m005, m006, m007, m008, m009, m010, m011, m012];
}
