-- Table pour tracker les fichiers téléchargés
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'webapp', -- 'webapp' | 'telegram'
  telegram_chat_id TEXT,
  downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  accessed_at DATETIME,
  deleted_at DATETIME,
  is_deleted INTEGER DEFAULT 0
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_files_downloaded_at ON files(downloaded_at);
CREATE INDEX IF NOT EXISTS idx_files_is_deleted ON files(is_deleted);
CREATE INDEX IF NOT EXISTS idx_files_source ON files(source);

-- Table pour la configuration dynamique
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Configuration par défaut: limite de stockage = 1GB
INSERT OR IGNORE INTO config (key, value) VALUES ('storage_limit_bytes', '1073741824');
INSERT OR IGNORE INTO config (key, value) VALUES ('storage_limit_gb', '1');
