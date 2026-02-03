-- Migration: Ajout de la colonne compressed pour marquer les messages compressés
-- Date: 2026-02-03

-- Ajouter la colonne compressed (0 = non compressé, 1 = compressé/caché du contexte LLM)
ALTER TABLE conversations ADD COLUMN compressed INTEGER DEFAULT 0;

-- Index pour filtrer rapidement les messages non compressés
CREATE INDEX IF NOT EXISTS idx_conversations_compressed ON conversations(compressed);
