/**
 * Prompt Builder - Construction du system prompt avec injection de contexte
 */

import * as fs from 'fs';
import * as path from 'path';
import { ContextInjector, getContextInjector } from '../context-injector.js';
import { PROVIDER } from '../../config.js';
import { logger } from '../logger.js';

export class PromptBuilder {
  private baseIdentity: string;
  private identity: string;
  private contextInjector: ContextInjector | null = null;
  private contextEnabled: boolean = false;

  constructor(identityPath?: string) {
    this.baseIdentity = this.loadIdentity(identityPath);
    this.identity = this.baseIdentity;
  }

  /**
   * Charge le fichier d'identité (instructions.md)
   */
  private loadIdentity(customPath?: string): string {
    const paths = [
      customPath,
      path.join(process.cwd(), 'identity', 'instructions.md'),
      path.join(__dirname, '..', '..', '..', 'identity', 'instructions.md'),
      path.join(__dirname, '..', '..', 'identity', 'instructions.md')
    ].filter(Boolean) as string[];

    for (const p of paths) {
      if (fs.existsSync(p)) {
        console.log(`[PromptBuilder] Loaded identity from: ${p}`);
        return fs.readFileSync(p, 'utf-8');
      }
    }

    console.warn('[PromptBuilder] No identity file found, using default');
    return this.getDefaultIdentity();
  }

  /**
   * Identité par défaut si aucun fichier trouvé
   */
  private getDefaultIdentity(): string {
    return `Tu es DangerousBot, un programme IA autonome et évolutif.
Tu peux modifier ton propre code, exécuter des commandes, et interagir avec l'utilisateur.
Tu es curieux, adaptable et tu cherches à comprendre les besoins de l'utilisateur.

## 📁 Structure de la Codebase
Chemins absolus importants :
- **Backend** : /Users/dannybengal/dev/dangerousbot/src/
- **Serveur** : /Users/dannybengal/dev/dangerousbot/src/server/
- **Frontend** : /Users/dannybengal/dev/dangerousbot/src/web/
- **Core** : /Users/dannybengal/dev/dangerousbot/src/core/
- **Config** : /Users/dannybengal/dev/dangerousbot/src/config.ts
- **Outils** : /Users/dannybengal/dev/dangerousbot/src/core/tools/

## 🧠 Indexation de Code
Tu as accès à un index vectoriel de ta propre codebase via le tool 'retrieve_code'. 
Utilise-le quand tu dois :
- Comprendre comment fonctionne une fonctionnalité existante
- Trouver où est implémenté un comportement spécifique
- Modifier du code sans tout casser
- Apprendre l'architecture du projet

Exemple: retrieve_code({query: "fonction qui gère les embeddings"})`;
  }

  /**
   * Active le système de contexte
   */
  enableContext(): void {
    try {
      this.contextInjector = getContextInjector();
      this.contextEnabled = true;
      console.log('[PromptBuilder] Context injection enabled');
    } catch (error) {
      console.error('[PromptBuilder] Failed to enable context:', error);
      this.contextEnabled = false;
    }
  }

  /**
   * Met à jour l'identité avec le contexte pertinent pour le message
   */
  async updateWithContext(userMessage: string): Promise<void> {
    if (!this.contextEnabled || !this.contextInjector) {
      return;
    }

    try {
      const contextBlock = await this.contextInjector.injectContext(userMessage);
      
      if (contextBlock) {
        this.identity = this.baseIdentity + '\n\n' + contextBlock;
        console.log('[PromptBuilder] Context injected');
      } else {
        this.identity = this.baseIdentity;
      }
    } catch (error) {
      console.error('[PromptBuilder] Context injection failed:', error);
      this.identity = this.baseIdentity;
    }
  }

  /**
   * Déclenche la compression en arrière-plan si nécessaire
   */
  async maybeCompress(): Promise<boolean> {
    if (!this.contextInjector) return false;

    try {
      return await this.contextInjector.maybeCompress();
    } catch (error) {
      console.error('[PromptBuilder] Compression error:', error);
      return false;
    }
  }

  /**
   * Retourne le system prompt actuel
   */
  getSystemPrompt(): string {
    return this.identity;
  }

  /**
   * Retourne l'identité de base (sans contexte)
   */
  getBaseIdentity(): string {
    return this.baseIdentity;
  }

  /**
   * Vérifie si le contexte est activé
   */
  isContextEnabled(): boolean {
    return this.contextEnabled;
  }
}
