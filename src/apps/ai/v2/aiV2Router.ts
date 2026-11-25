import express, { type RequestHandler, type Router } from 'express';

import { createAiV2Controller } from './aiV2Controller.js';
import {
  aiV2JsonErrorHandler,
  aiV2JsonParser,
  createAiV2DemoGuard,
  requireAiV2Json,
} from './aiV2Middleware.js';
import { aiV2Model, type AiV2Model } from './aiV2Model.js';
import {
  createAiV2GeminiAnswerService,
  type AiV2AnswerService,
} from './aiV2Service.js';

export function createAiV2Router(
  demoGuard: RequestHandler = createAiV2DemoGuard(),
  model: AiV2Model = aiV2Model,
  answerService: AiV2AnswerService = createAiV2GeminiAnswerService(),
): Router {
  const router = express.Router();
  const controller = createAiV2Controller(model, answerService);

  router.post(
    '/api/ai/v2/conversations',
    demoGuard,
    requireAiV2Json,
    aiV2JsonParser,
    aiV2JsonErrorHandler,
    controller.createConversation,
  );
  router.get(
    '/api/ai/v2/conversations',
    demoGuard,
    controller.listConversations,
  );
  router.get(
    '/api/ai/v2/conversations/:conversationId/turns',
    demoGuard,
    controller.listTurns,
  );
  router.post(
    '/api/ai/v2/conversations/:conversationId/turns',
    demoGuard,
    requireAiV2Json,
    aiV2JsonParser,
    aiV2JsonErrorHandler,
    controller.ask,
  );

  return router;
}
