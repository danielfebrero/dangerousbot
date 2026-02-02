/**
 * GitignoreParser - Parse et applique les patterns .gitignore
 * Supporte la syntaxe standard de gitignore
 */

import * as fs from 'fs';
import * as path from 'path';

export interface GitignorePattern {
  pattern: string;
  negated: boolean;     // true si commence par !
  directoryOnly: boolean; // true si se termine par /
  anchored: boolean;    // true si commence par / ou contient /
}

export class GitignoreParser {
  private patterns: GitignorePattern[] = [];
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.loadGitignore();
  }

  /**
   * Charge le fichier .gitignore s'il existe
   */
  private loadGitignore(): void {
    const gitignorePath = path.join(this.basePath, '.gitignore');
    
    if (!fs.existsSync(gitignorePath)) {
      return;
    }

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    this.patterns = this.parse(content);
  }

  /**
   * Parse le contenu d'un .gitignore
   */
  parse(content: string): GitignorePattern[] {
    const patterns: GitignorePattern[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Ignorer les lignes vides et les commentaires
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Pattern négatif (exception)
      let negated = false;
      let pattern = trimmed;
      
      if (pattern.startsWith('!')) {
        negated = true;
        pattern = pattern.slice(1);
      }

      // Pattern directory-only
      let directoryOnly = false;
      if (pattern.endsWith('/')) {
        directoryOnly = true;
        pattern = pattern.slice(0, -1);
      }

      // Pattern ancré (commence par / ou contient /)
      const anchored = pattern.startsWith('/') || pattern.includes('/');
      
      // Enlever le / initial pour la comparaison
      if (pattern.startsWith('/')) {
        pattern = pattern.slice(1);
      }

      patterns.push({
        pattern,
        negated,
        directoryOnly,
        anchored
      });
    }

    return patterns;
  }

  /**
   * Vérifie si un chemin est ignoré par le .gitignore
   */
  isIgnored(filePath: string, isDirectory: boolean = false): boolean {
    // Normaliser le chemin (relatif à basePath)
    let relativePath = filePath;
    
    if (path.isAbsolute(filePath)) {
      relativePath = path.relative(this.basePath, filePath);
    }
    
    // Utiliser / comme séparateur pour la comparaison
    relativePath = relativePath.replace(/\\/g, '/');
    
    // Ignorer toujours le dossier .git
    if (relativePath === '.git' || relativePath.startsWith('.git/')) {
      return true;
    }

    let ignored = false;

    for (const pattern of this.patterns) {
      const matches = this.matchPattern(relativePath, isDirectory, pattern);
      
      if (matches) {
        if (pattern.negated) {
          ignored = false;
        } else {
          ignored = true;
        }
      }
    }

    return ignored;
  }

  /**
   * Vérifie si un pattern match un chemin
   */
  private matchPattern(
    relativePath: string,
    isDirectory: boolean,
    pattern: GitignorePattern
  ): boolean {
    // Si le pattern est directory-only et qu'on teste un fichier, pas de match
    if (pattern.directoryOnly && !isDirectory) {
      return false;
    }

    const { pattern: pat } = pattern;

    // Pattern ancré (doit matcher depuis la racine)
    if (pattern.anchored) {
      return this.matchGlob(relativePath, pat);
    }

    // Pattern non ancré : peut matcher n'importe où dans le chemin
    // On teste le chemin complet et chaque segment
    const parts = relativePath.split('/');
    
    // Test sur le chemin complet
    if (this.matchGlob(relativePath, pat)) {
      return true;
    }

    // Test sur chaque segment du chemin
    for (let i = 0; i < parts.length; i++) {
      const subPath = parts.slice(i).join('/');
      if (this.matchGlob(subPath, pat)) {
        return true;
      }
      // Test aussi le segment seul pour les patterns comme *.log
      if (this.matchGlob(parts[i], pat)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match un glob simple (* et **)
   */
  private matchGlob(str: string, pattern: string): boolean {
    // Convertir le pattern glob en regex
    let regexPattern = pattern
      // Échapper les caractères spéciaux regex
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // ** match tout (y compris /)
      .replace(/\\\*\\\*/g, '***')
      // * match tout sauf /
      .replace(/\\\*/g, '[^/]*')
      // ? match un caractère
      .replace(/\\\?/g, '.')
      // Remettre **
      .replace(/\*\*\*/g, '.*');

    // Pour les patterns qui ne contiennent pas de /, on ajoute une option
    // pour matcher soit le nom exact, soit un suffixe
    if (!pattern.includes('/')) {
      regexPattern = `(?:^|/)${regexPattern}$`;
    } else {
      regexPattern = `^${regexPattern}$`;
    }

    try {
      const regex = new RegExp(regexPattern);
      return regex.test(str);
    } catch {
      // Si la regex est invalide, on fait une comparaison simple
      return str === pattern;
    }
  }

  /**
   * Retourne tous les patterns parsés (pour debug)
   */
  getPatterns(): GitignorePattern[] {
    return [...this.patterns];
  }
}

/**
 * Crée un parser pour un projet donné
 */
export function createGitignoreParser(projectPath: string): GitignoreParser {
  return new GitignoreParser(projectPath);
}

/**
 * Vérifie si un fichier doit être ignoré selon le .gitignore du projet
 */
export function shouldIgnoreFile(
  projectPath: string,
  filePath: string,
  isDirectory: boolean = false
): boolean {
  const parser = createGitignoreParser(projectPath);
  return parser.isIgnored(filePath, isDirectory);
}
