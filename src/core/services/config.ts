/**
 * ConfigService - Gestion dynamique de la configuration
 * Stocke et récupère les valeurs de config depuis la base de données
 */

import { getMemory } from '../memory';
import { getDatabase } from '../../database/index.js';

export class ConfigService {
  private static instance: ConfigService;
  private cache: Map<string, string> = new Map();
  private cacheValid: boolean = false;

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Récupère une valeur de configuration
   */
  async get(key: string, defaultValue?: string): Promise<string | undefined> {
    // Vérifier le cache d'abord
    if (this.cacheValid && this.cache.has(key)) {
      return this.cache.get(key);
    }

    const memory = getMemory();
    const value = memory.getConfig(key);

    if (value !== null) {
      this.cache.set(key, value);
      return value;
    }

    return defaultValue;
  }

  /**
   * Définit une valeur de configuration
   */
  async set(key: string, value: string): Promise<void> {
    const memory = getMemory();
    memory.setConfig(key, value);

    // Mettre à jour le cache
    this.cache.set(key, value);
  }

  /**
   * Récupère toutes les configurations
   */
  async getAll(): Promise<Record<string, string>> {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[];

    const config: Record<string, string> = {};
    for (const row of rows) {
      config[row.key] = row.value;
      this.cache.set(row.key, row.value);
    }

    this.cacheValid = true;
    return config;
  }

  /**
   * Supprime une configuration
   */
  async delete(key: string): Promise<void> {
    const db = getDatabase();
    db.prepare('DELETE FROM config WHERE key = ?').run(key);

    this.cache.delete(key);
  }

  /**
   * Récupère la limite de stockage en bytes
   */
  async getStorageLimitBytes(): Promise<number> {
    const value = await this.get('storage_limit_bytes', '1073741824'); // 1GB default
    return parseInt(value!, 10);
  }

  /**
   * Définit la limite de stockage en GB
   */
  async setStorageLimitGB(gb: number): Promise<void> {
    const bytes = gb * 1024 * 1024 * 1024;
    await this.set('storage_limit_gb', gb.toString());
    await this.set('storage_limit_bytes', bytes.toString());
  }

  /**
   * Invalide le cache
   */
  invalidateCache(): void {
    this.cacheValid = false;
    this.cache.clear();
  }
}

// Export singleton
export const configService = ConfigService.getInstance();
