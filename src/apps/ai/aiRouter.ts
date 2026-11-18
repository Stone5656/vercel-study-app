import express, { type RequestHandler, type Router } from 'express';

import { createAiController } from './aiController.js';
import { createAiDemoGuard } from './aiMiddleware.js';
import { aiHistoryModel, type AiHistoryModel } from './aiModel.js';

export function createAiRouter(
  demoGuard: RequestHandler = createAiDemoGuard(),
  historyModel: AiHistoryModel = aiHistoryModel,
): Router {
  const router = express.Router();
  const controller = createAiController(historyModel);

  router.post('/api/ai/ask', demoGuard);
  router.get('/api/ai/history', demoGuard, controller.history);

  return router;
}
