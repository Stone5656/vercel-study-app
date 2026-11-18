import type { RequestHandler } from 'express';

import {
  AiDatabaseError,
  aiHistoryModel,
  type AiHistoryModel,
} from './aiModel.js';

type AiController = {
  history: RequestHandler;
};

export function createAiController(
  model: AiHistoryModel = aiHistoryModel,
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
  };
}
