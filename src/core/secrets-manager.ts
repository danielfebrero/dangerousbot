/**
 * Gestionnaire de secrets pour DangerousBot
 * Stocke les secrets dans ~/.dangerousbot/secrets/
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

const DANGEROUSBOT_DIR = path.join(os.homedir(), '.dangerousbot');
const SECRETS_DIR = path.join(DANGEROUSBOT_DIR, 'secrets');
const API_KEY_FILE = path.join(SECRETS_DIR, 'anthropic_api_key');

export class SecretsManager {
  /**
   * Assure que les dossiers existent
   */
  static ensureDirectories(): void {
    if (!fs.existsSync(DANGEROUSBOT_DIR)) {
      fs.mkdirSync(DANGEROUSBOT_DIR, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(SECRETS_DIR)) {
      fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Vérifie si la clé API existe
   */
  static hasApiKey(): boolean {
    return fs.existsSync(API_KEY_FILE);
  }

  /**
   * Récupère la clé API
   */
  static getApiKey(): string | null {
    if (!this.hasApiKey()) {
      return null;
    }
    try {
      return fs.readFileSync(API_KEY_FILE, 'utf-8').trim();
    } catch {
      return null;
    }
  }

  /**
   * Sauvegarde la clé API
   */
  static saveApiKey(apiKey: string): void {
    this.ensureDirectories();
    fs.writeFileSync(API_KEY_FILE, apiKey.trim(), { encoding: 'utf-8', mode: 0o600 });
  }

  /**
   * Demande la clé API à l'utilisateur via stdin
   */
  static async promptForApiKey(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║  Premier lancement de DangerousBot                         ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log('DangerousBot a besoin d\'une clé API Claude (Anthropic) pour fonctionner.');
      console.log('La clé sera stockée de façon sécurisée dans ~/.dangerousbot/secrets/\n');

      rl.question('Clé API Claude: ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  /**
   * Assure qu'une clé API est disponible (demande si nécessaire)
   * Retourne la clé ou lance une erreur si non fournie
   */
  static async ensureApiKey(): Promise<string> {
    // D'abord vérifier la variable d'environnement
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) {
      return envKey;
    }

    // Ensuite vérifier le fichier de secrets
    const savedKey = this.getApiKey();
    if (savedKey) {
      return savedKey;
    }

    // Sinon demander à l'utilisateur
    const newKey = await this.promptForApiKey();
    
    if (!newKey) {
      throw new Error('Aucune clé API fournie. DangerousBot ne peut pas démarrer.');
    }

    // Valider le format basique
    if (!newKey.startsWith('sk-ant-')) {
      console.warn('\n⚠️  Attention: La clé ne commence pas par "sk-ant-". Vérifiez qu\'elle est correcte.\n');
    }

    // Sauvegarder pour les prochains lancements
    this.saveApiKey(newKey);
    console.log('\n✓ Clé API sauvegardée dans ~/.dangerousbot/secrets/\n');

    return newKey;
  }

  /**
   * Supprime la clé API (pour reset)
   */
  static deleteApiKey(): boolean {
    if (this.hasApiKey()) {
      fs.unlinkSync(API_KEY_FILE);
      return true;
    }
    return false;
  }

  /**
   * Retourne le chemin du dossier de secrets
   */
  static getSecretsPath(): string {
    return SECRETS_DIR;
  }

  /**
   * Retourne le chemin du dossier DangerousBot
   */
  static getDangerousBotPath(): string {
    return DANGEROUSBOT_DIR;
  }
}
