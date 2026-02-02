#!/usr/bin/env node

/**
 * Script de synchronisation de l'index de code
 * Compare les fichiers indexés avec ce qui devrait l'être selon le .gitignore
 * et synchronise la base de données (ajoute/supprime selon besoin)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { getMemory } from '../src/core/memory.js';
import { createGitignoreParser } from '../src/core/gitignore-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SyncResult {
  project: string;
  added: string[];
  removed: string[];
  updated: string[];
  unchanged: number;
  errors: string[];
}

interface ProjectSync {
  projectName: string;
  projectPath: string;
}

/**
 * Liste tous les fichiers source d'un projet (respecte le .gitignore)
 */
function getSourceFiles(projectPath: string, projectName: string): string[] {
  const files: string[] = [];
  const gitignoreParser = createGitignoreParser(projectPath);

  // Pour DangerousBot: scanner uniquement src/
  // Pour autres projets: scanner la racine complète
  const srcDir = path.join(projectPath, 'src');
  const hasSrcDir = fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory();
  const rootsToScan = (projectName === 'dangerousbot' && hasSrcDir)
    ? [srcDir]
    : [projectPath];

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(projectPath, fullPath);

      // Vérifier si le chemin est ignoré par .gitignore
      if (gitignoreParser.isIgnored(relativePath, entry.isDirectory())) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && shouldIndexFile(entry.name)) {
        files.push(relativePath);
      }
    }
  };

  for (const root of rootsToScan) {
    walk(root);
  }

  return files;
}

function shouldIndexFile(filename: string): boolean {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.rs', '.toml', '.lock'];
  const ext = path.extname(filename).toLowerCase();
  return extensions.includes(ext) && !filename.endsWith('.d.ts');
}

function computeHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Synchronise un projet
 */
async function syncProject(project: ProjectSync): Promise<SyncResult> {
  const result: SyncResult = {
    project: project.projectName,
    added: [],
    removed: [],
    updated: [],
    unchanged: 0,
    errors: []
  };

  const memory = getMemory();

  // 1. Obtenir la liste des fichiers actuels
  const currentFiles = new Set(getSourceFiles(project.projectPath, project.projectName));
  console.log(`[${project.projectName}] ${currentFiles.size} fichiers source trouvés`);

  // 2. Obtenir les métadonnées des fichiers indexés
  const indexedMetadata = memory.getCodeEmbeddingMetadata(project.projectName);
  console.log(`[${project.projectName}] ${indexedMetadata.size} fichiers déjà indexés`);

  // 3. Identifier les fichiers à ajouter (présents sur disque, pas dans la DB)
  for (const filePath of currentFiles) {
    if (!indexedMetadata.has(filePath)) {
      result.added.push(filePath);
    }
  }

  // 4. Identifier les fichiers à supprimer (dans la DB, pas sur disque ou ignorés)
  const gitignoreParser = createGitignoreParser(project.projectPath);
  
  for (const [indexedFile] of indexedMetadata) {
    const fullPath = path.join(project.projectPath, indexedFile);
    
    // Supprimer si:
    // - Le fichier n'existe plus sur disque
    // - OU le fichier est maintenant ignoré par .gitignore
    if (!fs.existsSync(fullPath) || gitignoreParser.isIgnored(indexedFile, false)) {
      result.removed.push(indexedFile);
    }
  }

  // 5. Identifier les fichiers potentiellement modifiés (vérifie le hash)
  for (const filePath of currentFiles) {
    if (indexedMetadata.has(filePath)) {
      const indexed = indexedMetadata.get(filePath)!;
      try {
        const fullPath = path.join(project.projectPath, filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const currentHash = computeHash(content);

        if (currentHash !== indexed.content_hash) {
          result.updated.push(filePath);
        } else {
          result.unchanged++;
        }
      } catch (error) {
        result.errors.push(`${filePath}: ${(error as Error).message}`);
      }
    }
  }

  return result;
}

/**
 * Affiche un résumé coloré
 */
function printSummary(results: SyncResult[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ DE SYNCHRONISATION');
  console.log('='.repeat(60));

  for (const r of results) {
    const totalChanges = r.added.length + r.removed.length + r.updated.length;
    const status = totalChanges === 0 ? '✅' : '⚠️';
    
    console.log(`\n${status} Projet: ${r.project}`);
    console.log(`   ├─ À ajouter:   ${r.added.length.toString().padStart(3)} fichiers`);
    console.log(`   ├─ À supprimer: ${r.removed.length.toString().padStart(3)} fichiers`);
    console.log(`   ├─ À mettre à jour: ${r.updated.length.toString().padStart(3)} fichiers`);
    console.log(`   ├─ Inchangés:   ${r.unchanged.toString().padStart(3)} fichiers`);
    
    if (r.errors.length > 0) {
      console.log(`   └─ ⚠️ Erreurs:  ${r.errors.length}`);
      for (const err of r.errors.slice(0, 3)) {
        console.log(`      • ${err}`);
      }
      if (r.errors.length > 3) {
        console.log(`      ... et ${r.errors.length - 3} autres`);
      }
    } else {
      console.log(`   └─ ✅ OK`);
    }
  }

  const totalAdded = results.reduce((sum, r) => sum + r.added.length, 0);
  const totalRemoved = results.reduce((sum, r) => sum + r.removed.length, 0);
  const totalUpdated = results.reduce((sum, r) => sum + r.updated.length, 0);

  console.log('\n' + '-'.repeat(60));
  console.log(`TOTAL: ${totalAdded} ajouts, ${totalRemoved} suppressions, ${totalUpdated} mises à jour`);
  console.log('='.repeat(60));
}

/**
 * Main
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  
  console.log('🔍 Analyse de la synchronisation de l\'index...\n');
  if (dryRun) {
    console.log('📋 Mode dry-run: aucune modification ne sera effectuée\n');
  }

  const memory = getMemory();
  const projects = memory.listIndexedProjects();

  if (projects.length === 0) {
    console.log('⚠️ Aucun projet indexé trouvé.');
    process.exit(0);
  }

  console.log(`📂 ${projects.length} projet(s) indexé(s): ${projects.join(', ')}\n`);

  // Pour chaque projet, on doit connaître son chemin
  // On le récupère depuis la DB ou on utilise des chemins par défaut
  const projectPaths: Map<string, string> = new Map();
  
  // Projet par défaut (DangerousBot)
  projectPaths.set('dangerousbot', path.resolve(__dirname, '..'));
  
  // Pour les autres projets, on essaie de déduire le chemin
  // (en l'absence d'info, on skip)
  const results: SyncResult[] = [];

  for (const projectName of projects) {
    let projectPath = projectPaths.get(projectName);
    
    if (!projectPath) {
      // Essayer de trouver le chemin dans le répertoire parent
      const possiblePath = path.resolve(__dirname, '..', '..', projectName);
      if (fs.existsSync(possiblePath)) {
        projectPath = possiblePath;
      } else {
        console.log(`⚠️ Projet '${projectName}': chemin inconnu, ignoré`);
        continue;
      }
    }

    console.log(`\n🔎 Analyse du projet: ${projectName}`);
    console.log(`   Chemin: ${projectPath}`);

    const result = await syncProject({ projectName, projectPath });
    results.push(result);

    if (!dryRun) {
      // Supprimer les fichiers obsolètes
      if (result.removed.length > 0) {
        console.log(`   🗑️ Suppression de ${result.removed.length} fichiers...`);
        for (const file of result.removed) {
          memory.deleteCodeEmbedding(file, projectName);
        }
      }

      // Note: L'ajout et la mise à jour nécessitent des embeddings
      // On ne les fait pas ici, ils seront gérés par code_index refresh
      if (result.added.length > 0 || result.updated.length > 0) {
        console.log(`   ℹ️  ${result.added.length + result.updated.length} fichiers nécessitent une réindexation`);
        console.log(`   💡 Lancez: code_index refresh project_name: "${projectName}"`);
      }
    }
  }

  printSummary(results);

  if (!dryRun) {
    const totalChanges = results.reduce((sum, r) => sum + r.removed.length, 0);
    if (totalChanges > 0) {
      console.log(`\n✅ ${totalChanges} fichier(s) supprimé(s) de l'index`);
    }
  }
}

main().catch((error) => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});
