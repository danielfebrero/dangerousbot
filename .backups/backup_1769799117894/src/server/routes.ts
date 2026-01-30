/**
 * Routes - API REST pour DangerousBot
 */

import { Router, Request, Response } from 'express';
import { getMemory } from '../core/memory.js';
import { logger } from '../core/logger.js';

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

  return router;
}
