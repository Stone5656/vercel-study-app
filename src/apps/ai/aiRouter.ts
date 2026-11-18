import express, { type RequestHandler, type Router } from 'express';

import { createAiController } from './aiController.js';
import { createAiDemoGuard } from './aiMiddleware.js';
import {
  aiHistoryModel,
  aiModel,
  type AiHistoryItem,
  type AiHistoryModel,
} from './aiModel.js';
import {
  createAiAnswerServiceGuard,
  selectAiAnswerService,
  type AiAnswerService,
} from './aiService.js';

const invalidJsonResponse = {
  success: false,
  error: {
    code: 'INVALID_JSON',
    message: 'JSONの形式が不正です',
  },
} as const;

const payloadTooLargeResponse = {
  success: false,
  error: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'リクエスト本文が大きすぎます',
  },
} as const;

const unsupportedMediaTypeResponse = {
  success: false,
  error: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'JSON形式で送信してください',
  },
} as const;

const jsonParser = express.json({ limit: 16_384, strict: false });
const requireJsonContentType: RequestHandler = (req, res, next): void => {
  if (!req.is('application/json')) {
    res.status(415).json(unsupportedMediaTypeResponse);
    return;
  }
  next();
};

const aiJsonErrorHandler: express.ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    res.status(400).json(invalidJsonResponse);
    return;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  ) {
    res.status(413).json(payloadTooLargeResponse);
    return;
  }
  next(error);
};

export function createAiRouter(
  demoGuard: RequestHandler = createAiDemoGuard(),
  historyModel: AiHistoryModel = aiHistoryModel,
  serviceGuard: RequestHandler = createAiAnswerServiceGuard(),
  answerService: AiAnswerService = selectAiAnswerService(),
  saveQuestionAnswer: (
    prompt: string,
    response: string,
  ) => Promise<AiHistoryItem> = aiModel.saveQuestionAnswer,
): Router {
  const router = express.Router();
  const controller = createAiController(
    historyModel,
    answerService,
    saveQuestionAnswer,
  );

  router.post(
    '/api/ai/ask',
    demoGuard,
    requireJsonContentType,
    jsonParser,
    aiJsonErrorHandler,
    serviceGuard,
    controller.ask,
  );
  router.get('/api/ai/history', demoGuard, controller.history);

  return router;
}
