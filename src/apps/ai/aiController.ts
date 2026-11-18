import type { RequestHandler } from 'express';

import {
  AiDatabaseError,
  aiModel,
  type AiHistoryModel,
  type AiHistoryItem,
} from './aiModel.js';
import { type AiAnswerService, mockAiAnswerService } from './aiService.js';

type AiController = {
  history: RequestHandler;
  ask: RequestHandler;
};

const validationError = {
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: '入力内容を確認してください',
  },
} as const;

export function createAiController(
  model: AiHistoryModel = aiModel,
  answerService: AiAnswerService = mockAiAnswerService,
  saveQuestionAnswer: (
    prompt: string,
    response: string,
  ) => Promise<AiHistoryItem> = aiModel.saveQuestionAnswer,
): AiController {
  return {
    history: async (_req, res): Promise<void> => {
      try {
        const items = await model.listHistory();
        res.status(200).json({
          success: true,
          items,
        });
      } catch (error) {
        if (error instanceof AiDatabaseError) {
          res.status(503).json({
            success: false,
            error: {
              code: 'DB_UNAVAILABLE',
              message: 'データベースを利用できません',
            },
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: '内部エラーが発生しました',
          },
        });
      }
    },
    ask: async (req, res): Promise<void> => {
      const body: unknown = req.body;
      if (
        typeof body !== 'object' ||
        body === null ||
        Array.isArray(body) ||
        !('prompt' in body) ||
        typeof body.prompt !== 'string'
      ) {
        res.status(400).json(validationError);
        return;
      }

      const prompt = body.prompt.trim();
      const promptLength = Array.from(prompt).length;
      if (promptLength < 1 || promptLength > 2000) {
        res.status(400).json(validationError);
        return;
      }

      let response: string;
      try {
        response = await answerService.generateAnswer(prompt);
        if (response.trim().length === 0) {
          throw new Error('AI returned an empty answer');
        }
      } catch {
        res.status(502).json({
          success: false,
          error: {
            code: 'AI_UNAVAILABLE',
            message: 'AI回答を取得できませんでした',
          },
        });
        return;
      }

      try {
        const item = await saveQuestionAnswer(prompt, response);
        res.status(201).json({ success: true, item });
      } catch (error) {
        if (error instanceof AiDatabaseError) {
          res.status(503).json({
            success: false,
            error: {
              code: 'DB_UNAVAILABLE',
              message: 'データベースを利用できません',
            },
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: '内部エラーが発生しました',
          },
        });
      }
    },
  };
}
