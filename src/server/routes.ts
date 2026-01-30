/**
 * Routes - API REST pour DangerousBot
 */

import { Router, Request, Response } from 'express';
import { getMemory } from '../core/memory.js';

export function createRoutes(): Router {
  const router = Router();

  // Health check
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
    res.json({
      session_id: memory.getSessionId(),
      messages
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

  return router;
}
