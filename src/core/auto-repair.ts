/**
 * Service de réparation automatique
 * Applique des stratégies de réparation basées sur le type d'erreur
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RepairAction {
  type: 'create_file' | 'update_file' | 'install_dependency' | 'fix_json';
  description: string;
  execute: () => Promise<boolean>;
}

export class AutoRepairService {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Crée un fichier avec du contenu
   */
  createFile(filePath: string, content: string): RepairAction {
    return {
      type: 'create_file',
      description: `Créer le fichier ${filePath}`,
      execute: async () => {
        try {
          const fullPath = path.join(this.baseDir, filePath);
          const dir = path.dirname(fullPath);

          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(fullPath, content, 'utf8');
          return true;
        } catch (err) {
          console.error(`Erreur lors de la création de ${filePath}:`, err);
          return false;
        }
      }
    };
  }

  /**
   * Obtient les suggestions de réparation basées sur le message d'erreur
   */
  getSuggestedRepairs(errorMessage: string): RepairAction[] {
    const repairs: RepairAction[] = [];

    // Fichier de configuration manquant
    if (
      errorMessage.includes('config.json') ||
      errorMessage.includes('ENOENT') && errorMessage.includes('data')
    ) {
      repairs.push(
        this.createFile(
          'data/config.json',
          JSON.stringify(
            {
              bot: {
                name: 'DangerousBot',
                version: '0.1.0',
                debug: false
              },
              api: {
                port: 3000,
                host: 'localhost'
              },
              anthropic: {
                model: 'claude-3-5-sonnet-20241022',
                maxTokens: 4096
              }
            },
            null,
            2
          )
        )
      );
    }

    // Variable d'environnement manquante
    if (
      errorMessage.includes('ANTHROPIC_API_KEY') ||
      errorMessage.includes('undefined') && errorMessage.includes('API')
    ) {
      repairs.push(
        this.createFile(
          '.env',
          '# Anthropic API\nANTHROPIC_API_KEY=sk-ant-...\n'
        )
      );
    }

    // Dossier logs manquant
    if (errorMessage.includes('logs') || errorMessage.includes('mkdir')) {
      repairs.push(
        this.createFile(
          'logs/.gitkeep',
          ''
        )
      );
    }

    // Instructions ou identité manquantes
    if (errorMessage.includes('instructions') || errorMessage.includes('identity')) {
      repairs.push(
        this.createFile(
          'identity/instructions.md',
          '# DangerousBot Instructions\n\n' +
          '## Directives de fonctionnement\n' +
          'À compléter selon vos besoins.\n'
        )
      );
    }

    return repairs;
  }

  /**
   * Applique une série de réparations
   */
  async applyRepairs(repairs: RepairAction[]): Promise<{
    succeeded: RepairAction[];
    failed: RepairAction[];
  }> {
    const succeeded: RepairAction[] = [];
    const failed: RepairAction[] = [];

    for (const repair of repairs) {
      try {
        const success = await repair.execute();
        if (success) {
          succeeded.push(repair);
        } else {
          failed.push(repair);
        }
      } catch (err) {
        console.error(`Erreur lors de l'exécution de la réparation:`, err);
        failed.push(repair);
      }
    }

    return { succeeded, failed };
  }

  /**
   * Crée tous les fichiers de config par défaut
   */
  ensureConfigFiles(): void {
    const defaultConfigs = [
      {
        path: 'data/.gitkeep',
        content: ''
      },
      {
        path: 'logs/.gitkeep',
        content: ''
      }
    ];

    for (const config of defaultConfigs) {
      const fullPath = path.join(this.baseDir, config.path);
      if (!fs.existsSync(fullPath)) {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, config.content, 'utf8');
      }
    }
  }
}
