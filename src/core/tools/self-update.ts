/**
 * Tool: self_update - Compile et redémarre le système
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { getMemory } from '../memory';
import { getCodeEmbeddingService, CodeEmbeddingService } from '../code-embedding';
import { getCodeIndexer } from '../code-indexer';

export const selfUpdateDefinition: Tool = {
  name: 'self_update',
  description: 'Compile et redémarre DangerousBot. À utiliser après avoir modifié des fichiers avec edit_file/write_file. Effectue: validation TypeScript, build, et redémarrage avec rollback automatique en cas d\'échec.',
  input_schema: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Raison du redémarrage (optionnel)' }
    },
    required: []
  }
};

export const selfUpdateHandler: ToolHandler = {
  name: 'self_update',
  definition: selfUpdateDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const description = (input.reason as string) || 'Mise à jour du système';
    const force = (input.force as boolean) || false;
    
    // Vérifier si d'autres threads sont en cours de traitement
    const busyThreads = (global as any).__busyThreads || new Set<string>();
    const currentClientId = (global as any).__currentClientId;

    // Compter les threads busy (en excluant le client actuel si présent)
    const otherBusyThreads = Array.from(busyThreads as Set<string>).filter(id => id !== currentClientId);
    
    if (!force && otherBusyThreads.length > 0) {
      // D'autres threads sont busy, demander confirmation
      return {
        success: false,
        error: 'BUSY',
        message: `⚠️ ${otherBusyThreads.length} autre(s) thread(s) en cours de traitement.`,
        busyThreads: otherBusyThreads.length,
        canForce: true
      };
    }
    
    // Utiliser le système de rollback si disponible
    const rollbackManager = context.rollbackManager;
    
    if (rollbackManager) {
      // Mode sécurisé avec rollback automatique
      const result = await rollbackManager.safeUpdate(
        description,
        async () => {
          // Les modifications ont déjà été faites via edit_file/write_file
          // La validation CI (TypeScript + Build) est faite par safeUpdate
        },
        [] // Pas de fichiers spécifiques à sauvegarder (déjà versionnés via edit_file)
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          message: result.message,
          rollback: true,
          backupId: result.backupId
        };
      }

      // Versionner après succès
      const versionResult = await context.versioning.commitChanges(description);

      // Indexer les fichiers modifiés en arrière-plan
      try {
        const modifiedFiles = await rollbackManager.getModifiedFiles();
        const newFiles = await rollbackManager.getNewFiles();
        const deletedFiles = await rollbackManager.getDeletedFiles();
        const allChangedFiles = [...modifiedFiles, ...newFiles, ...deletedFiles];
        
        if (allChangedFiles.length > 0) {
          console.log(`[self_update] ${allChangedFiles.length} fichiers à ré-indexer`);
          const memory = getMemory();
          const embeddingService = getCodeEmbeddingService();
          const indexer = getCodeIndexer(process.cwd(), memory, embeddingService);
          
          // Lancer l'indexation en arrière-plan
          indexer.indexModifiedFiles(allChangedFiles).then((indexResult: {indexed: number, updated: number, deleted: number}) => {
            console.log(`[self_update] Indexation: ${indexResult.indexed} nouveaux, ${indexResult.updated} mis à jour, ${indexResult.deleted} supprimés`);
          }).catch((err: Error) => {
            console.warn('[self_update] Erreur indexation:', err);
          });
        }
      } catch (err) {
        console.warn('[self_update] Impossible d\'indexer les changements:', err);
      }

      // Programmer le redémarrage
      const fs = await import('fs');
      const path = await import('path');
      const restartFile = path.join(process.cwd(), '.restart');
      fs.writeFileSync(restartFile, JSON.stringify({
        reason: description,
        timestamp: new Date().toISOString()
      }));
      (global as any).__pendingRestart = { reason: description };

      return {
        success: true,
        message: `✅ ${result.message} - Redémarrage programmé`,
        version: versionResult.version,
        backupId: result.backupId,
        needsRestart: true
      };
    } else {
      // Mode legacy sans rollback
      console.warn('[self_update] RollbackManager non disponible, mode legacy');

      const buildResult = await context.executor.shell('npm run build');
      if (!buildResult.success) {
        return { success: false, error: `Erreur de compilation: ${buildResult.error}` };
      }

      const versionResult = await context.versioning.commitChanges(description);
      if (!versionResult.success) {
        return { success: false, error: `Build OK mais erreur de versioning: ${versionResult.error}` };
      }

      const fs = await import('fs');
      const path = await import('path');
      const restartFile = path.join(process.cwd(), '.restart');
      fs.writeFileSync(restartFile, JSON.stringify({
        reason: description,
        timestamp: new Date().toISOString()
      }));
      (global as any).__pendingRestart = { reason: description };

      return {
        success: true,
        message: 'Build réussi et redémarrage programmé.',
        version: versionResult.version,
        needsRestart: true
      };
    }
  }
};
