/**
 * Routes - API REST pour DangerousBot
 */

import { Router, Request, Response } from 'express';
import { getMemory } from '../core/memory.js';
import { logger } from '../core/logger.js';
import { downloadService } from '../core/services/download.js';
import { cancelThreadExecution, isExecutionActive } from '../core/tool-cancellation.js';
import * as path from 'path';
import * as fs from 'fs';

export function createRoutes(): Router {
  const router = Router();

  // Health check (utilisé par le système de rollback)
  router.get('/health', (_req: Request, res: Response) => {
    const memory = getMemory();
    const stats = memory.getStats();
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: stats.version || '0.1.0',
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      stats: {
        sessions: stats.sessions,
        messages: stats.messages,
        knowledge: stats.knowledge
      }
    });
  });

  // Obtenir les stats
  router.get('/stats', (_req: Request, res: Response) => {
    const memory = getMemory();
    const stats = memory.getStats();
    res.json(stats);
  });

  // Obtenir l'historique de la session courante
  router.get('/history', (_req: Request, res: Response) => {
    const memory = getMemory();
    const messages = memory.getMessages();
    // Inclure les tool_calls dans la réponse
    res.json({
      session_id: memory.getSessionId(),
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        timestamp: m.timestamp
      }))
    });
  });

  // Obtenir les connaissances
  router.get('/knowledge', (req: Request, res: Response) => {
    const memory = getMemory();
    const type = req.query.type as string | undefined;
    const knowledge = memory.getKnowledge(type as any);
    res.json({ knowledge });
  });

  // Nouvelle session
  router.post('/session/new', (_req: Request, res: Response) => {
    const memory = getMemory();
    const oldSession = memory.getSessionId();
    // Créer une nouvelle instance force une nouvelle session
    const Memory = require('../core/memory.js').Memory;
    const newMemory = new Memory();
    res.json({
      success: true,
      old_session: oldSession,
      new_session: newMemory.getSessionId()
    });
  });

  // Reprendre la dernière session
  router.post('/session/resume', (_req: Request, res: Response) => {
    const memory = getMemory();
    const resumed = memory.resumeLastSession();
    if (resumed) {
      const messages = memory.getMessages();
      res.json({
        success: true,
        session_id: memory.getSessionId(),
        message_count: messages.length
      });
    } else {
      res.json({
        success: false,
        error: 'Aucune session précédente trouvée'
      });
    }
  });

  // Exporter la session
  router.get('/session/export', (_req: Request, res: Response) => {
    const memory = getMemory();
    const messages = memory.exportSession();
    res.json({
      session_id: memory.getSessionId(),
      exported_at: new Date().toISOString(),
      messages
    });
  });

  // Compresser le contexte manuellement
  router.post('/compress', async (_req: Request, res: Response) => {
    logger.info('Routes', 'Compression manuelle déclenchée');
    try {
      const { getCompressor, isCompressorInitialized } = await import('../core/compressor.js');
      
      if (!isCompressorInitialized()) {
        logger.error('Routes', 'Compressor non initialisé - le système de contexte n\'a pas été activé');
        res.status(500).json({ 
          success: false, 
          error: 'Système de compression non initialisé. Vérifiez que OPENROUTER_API_KEY est configuré.' 
        });
        return;
      }
      
      const compressor = getCompressor();
      
      if (compressor) {
        logger.info('Routes', 'Compressor trouvé, lancement compression...');
        const result = await compressor.compressIfNeeded(true); // force = true
        logger.info('Routes', `Compression terminée, compressed=${result}`);
        res.json({ 
          success: true, 
          compressed: result,
          message: result ? 'Compression effectuée' : 'Rien à compresser (pas assez de messages)'
        });
      } else {
        logger.error('Routes', 'Compressor est null après isCompressorInitialized=true');
        res.status(500).json({ 
          success: false, 
          error: 'Erreur interne: compressor null' 
        });
      }
    } catch (error) {
      logger.error('Routes', `Erreur compression: ${(error as Error).stack || String(error)}`);
      res.status(500).json({ 
        success: false, 
        error: String(error) 
      });
    }
  });

  // Webapp Settings
  router.get('/webapp/settings', (_req: Request, res: Response) => {
    const memory = getMemory();
    const settings = memory.getWebappSettings();
    res.json(settings);
  });

  router.post('/webapp/settings', (req: Request, res: Response) => {
    const memory = getMemory();
    const { showAllSources } = req.body;
    
    if (typeof showAllSources !== 'boolean') {
      res.status(400).json({ 
        success: false, 
        error: 'showAllSources must be a boolean' 
      });
      return;
    }
    
    memory.setWebappSettings({ showAllSources });
    res.json({ 
      success: true, 
      settings: { showAllSources } 
    });
  });

  // ============ FILE DOWNLOAD ENDPOINTS ============

  // Servir un fichier téléchargé par son ID
  router.get('/files/:id', async (req: Request, res: Response) => {
    const fileId = parseInt(req.params.id, 10);

    if (isNaN(fileId)) {
      res.status(400).json({ success: false, error: 'ID de fichier invalide' });
      return;
    }

    try {
      const file = await downloadService.getFile(fileId);

      if (!file) {
        res.status(404).json({ success: false, error: 'Fichier non trouvé' });
        return;
      }

      const filePath = downloadService.getFilePath(file.filename);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, error: 'Fichier non trouvé sur le disque' });
        return;
      }

      // Définir les headers pour le téléchargement
      const mimeType = file.mime_type || 'application/octet-stream';
      const filename = file.original_name || file.filename;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', file.size_bytes.toString());
      res.setHeader('X-File-Id', file.id.toString());
      res.setHeader('X-File-Source', file.source);

      // Streamer le fichier
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      logger.info('Routes', `Fichier servi: ${filename} (ID: ${fileId})`);

    } catch (error) {
      logger.error('Routes', `Erreur lors du service du fichier ${fileId}: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Erreur interne' });
    }
  });

  // Liste des fichiers (avec pagination)
  router.get('/files', async (req: Request, res: Response) => {
    const source = req.query.source as 'webapp' | 'telegram' | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      const files = await downloadService.listFiles(source);
      const totalSize = await downloadService.getTotalSize();

      // Pagination
      const paginatedFiles = files.slice(offset, offset + limit);

      res.json({
        success: true,
        data: {
          files: paginatedFiles.map(f => ({
            id: f.id,
            filename: f.original_name || f.filename,
            size: f.size_bytes,
            mimeType: f.mime_type,
            source: f.source,
            downloadedAt: f.downloaded_at,
            url: `/api/files/${f.id}`
          })),
          pagination: {
            total: files.length,
            limit,
            offset,
            hasMore: offset + limit < files.length
          },
          storage: {
            used: totalSize,
            usedFormatted: formatBytes(totalSize)
          }
        }
      });
    } catch (error) {
      logger.error('Routes', `Erreur lors de la liste des fichiers: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Erreur interne' });
    }
  });

  // Supprimer un fichier
  router.delete('/files/:id', async (req: Request, res: Response) => {
    const fileId = parseInt(req.params.id, 10);

    if (isNaN(fileId)) {
      res.status(400).json({ success: false, error: 'ID de fichier invalide' });
      return;
    }

    try {
      const deleted = await downloadService.deleteFile(fileId);

      if (deleted) {
        res.json({ success: true, message: `Fichier #${fileId} supprimé` });
      } else {
        res.status(404).json({ success: false, error: 'Fichier non trouvé' });
      }
    } catch (error) {
      logger.error('Routes', `Erreur lors de la suppression du fichier ${fileId}: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Erreur interne' });
    }
  });

  // Annuler l'exécution d'un tool sur un thread
  router.post('/cancel', (req: Request, res: Response) => {
    const { threadId } = req.body;

    if (!threadId) {
      res.status(400).json({ success: false, error: 'threadId requis' });
      return;
    }

    const wasCancelled = cancelThreadExecution(threadId, 'user_cancelled');

    if (wasCancelled) {
      logger.info('Routes', `Tool execution cancelled on thread ${threadId}`);
      res.json({
        success: true,
        message: 'Exécution annulée',
        threadId
      });
    } else {
      res.json({
        success: false,
        message: 'Aucune exécution active sur ce thread',
        threadId
      });
    }
  });

  // Vérifier si une exécution est active sur un thread
  router.get('/cancel/status', (req: Request, res: Response) => {
    const threadId = req.query.threadId as string;

    if (!threadId) {
      res.status(400).json({ success: false, error: 'threadId requis' });
      return;
    }

    const isActive = isExecutionActive(threadId);

    res.json({
      success: true,
      isActive,
      threadId
    });
  });

  return router;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
