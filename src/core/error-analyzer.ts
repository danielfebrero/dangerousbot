/**
 * Analyseur d'erreurs utilisant Claude Opus 4.5
 * Diagnostique et propose des réparations automatiques
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { SecretsManager } from './secrets-manager';

interface DiagnosisResult {
  diagnosis: string;
  rootCause: string;
  repair?: {
    type: string;
    description: string;
    changes: Array<{
      file: string;
      action: 'create' | 'update' | 'delete';
      content?: string;
    }>;
  };
}

export class ErrorAnalyzer {
  private client: Anthropic | null = null;
  private model = 'claude-3-5-sonnet-20241022';

  constructor() {
    // Client sera initialisé à la première utilisation
  }

  /**
   * Initialise le client Anthropic avec la clé API
   */
  private async getClient(): Promise<Anthropic> {
    if (!this.client) {
      const apiKey = await SecretsManager.ensureApiKey();
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  /**
   * Analyse une erreur et propose une réparation
   */
  async analyzeError(
    errorMessage: string,
    errorStack: string,
    projectRoot: string
  ): Promise<DiagnosisResult> {
    // Rassembler le contexte du projet
    const projectContext = await this.gatherProjectContext(projectRoot);

    // Préparer le prompt pour Claude
    const analysisPrompt = this.buildAnalysisPrompt(
      errorMessage,
      errorStack,
      projectContext
    );

    try {
      const client = await this.getClient();
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: analysisPrompt
          }
        ]
      });

      // Parser la réponse
      const analysis = this.parseAnalysisResponse(
        response.content[0].type === 'text' ? response.content[0].text : ''
      );

      return analysis;
    } catch (error) {
      throw new Error(
        `Erreur lors de l'analyse: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Rassemble le contexte du projet (package.json, structure, etc.)
   */
  private async gatherProjectContext(projectRoot: string): Promise<string> {
    const context: string[] = [];

    // Lecture du package.json
    const packagePath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageContent = fs.readFileSync(packagePath, 'utf8');
      context.push(`[package.json]\n${packageContent}`);
    }

    // Lecture du tsconfig.json
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf8');
      context.push(`[tsconfig.json]\n${tsconfigContent}`);
    }

    // Lister la structure des dossiers
    const structure = this.getProjectStructure(projectRoot, 2);
    context.push(`[Structure du projet]\n${structure}`);

    // Fichiers critiques
    const criticalFiles = [
      'src/start.ts',
      'src/core/index.ts',
      'data/config.json'
    ];

    for (const file of criticalFiles) {
      const filePath = path.join(projectRoot, file);
      if (fs.existsSync(filePath)) {
        try {
          let content = fs.readFileSync(filePath, 'utf8');
          // Limiter la taille
          if (content.length > 2000) {
            content = content.substring(0, 2000) + '\n... [truncated]';
          }
          context.push(`[${file}]\n${content}`);
        } catch {
          // Ignorer les fichiers non lisibles
        }
      }
    }

    return context.join('\n\n');
  }

  /**
   * Génère la structure du projet
   */
  private getProjectStructure(dir: string, depth: number, prefix = ''): string {
    if (depth === 0) return '';

    let structure = '';
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const filtered = entries.filter(
        (e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist'
      );

      for (const entry of filtered) {
        structure += `${prefix}├── ${entry.name}\n`;
        if (entry.isDirectory()) {
          const subStructure = this.getProjectStructure(
            path.join(dir, entry.name),
            depth - 1,
            prefix + '│   '
          );
          structure += subStructure;
        }
      }
    } catch {
      // Ignorer les erreurs de lecture
    }
    return structure;
  }

  /**
   * Construit le prompt d'analyse
   */
  private buildAnalysisPrompt(
    errorMessage: string,
    errorStack: string,
    projectContext: string
  ): string {
    return `Tu es un expert en débogage TypeScript/Node.js spécialisé dans la réparation automatique des erreurs de démarrage.

# Contexte du projet
${projectContext}

# Erreur rencontrée
Message: ${errorMessage}

Stack: ${errorStack}

# Tâche
1. Diagnostique la cause racine de cette erreur
2. Propose une réparation automatique si possible
3. Si une réparation est possible, fourniscs la liste exacte des fichiers à modifier/créer/supprimer

## Format de réponse (IMPORTANT - respecte strictement ce format JSON)
\`\`\`json
{
  "diagnosis": "Description courte du problème détecté",
  "rootCause": "Cause racine détaillée",
  "repair": {
    "type": "configuration|code|dependency|file",
    "description": "Description de la réparation",
    "changes": [
      {
        "file": "chemin/du/fichier",
        "action": "create|update|delete",
        "content": "contenu du fichier (seulement pour create/update)"
      }
    ]
  }
}
\`\`\`

Si aucune réparation automatique n'est possible, omets le champ "repair".
Les chemins de fichier doivent être relatifs à la racine du projet.
Pour les modifications de code existant, fournis le contenu complet du fichier modifié.`;
  }

  /**
   * Parse la réponse d'analyse
   */
  private parseAnalysisResponse(response: string): DiagnosisResult {
    try {
      // Extraire le JSON de la réponse
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch) {
        throw new Error('Format de réponse invalide');
      }

      const parsed = JSON.parse(jsonMatch[1]);

      return {
        diagnosis: parsed.diagnosis || 'Erreur inconnue',
        rootCause: parsed.rootCause || 'Cause inconnue',
        repair: parsed.repair ? {
          type: parsed.repair.type,
          description: parsed.repair.description,
          changes: parsed.repair.changes || []
        } : undefined
      };
    } catch (err) {
      // Si le parsing JSON échoue, retourner une diagnosis simple
      return {
        diagnosis: 'Erreur lors de l\'analyse',
        rootCause: response.substring(0, 500)
      };
    }
  }
}
