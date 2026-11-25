import type { RequestHandler } from 'express';

import {
  AiV2ConversationNotFoundError,
  AiV2DatabaseError,
  aiV2Model,
  type AiV2Model,
} from './aiV2Model.js';

const validationError = {
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: '入力内容を確認してください',
  },
} as const;

const internalError = {
  success: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: '内部エラーが発生しました',
  },
} as const;

const databaseUnavailable = {
  success: false,
  error: {
    code: 'DB_UNAVAILABLE',
    message: 'データベースを利用できません',
  },
} as const;

const conversationNotFound = {
  success: false,
  error: {
    code: 'CONVERSATION_NOT_FOUND',
    message: '会話が見つかりません',
  },
} as const;

function getTitle(body: unknown): string | null {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    !('title' in body) ||
    typeof body.title !== 'string'
  ) {
    return null;
  }

  const title = body.title.trim();
  const length = Array.from(title).length;
  return length >= 1 && length <= 50 ? title : null;
}

export function createAiV2Controller(model: AiV2Model = aiV2Model): {
  createConversation: RequestHandler;
  listConversations: RequestHandler;
  listTurns: RequestHandler;
} {
  return {
    createConversation: async (req, res): Promise<void> => {
      const title = getTitle(req.body as unknown);
      if (title === null) {
        res.status(400).json(validationError);
        return;
      }

      try {
        const item = await model.createConversation(title);
        res.status(201).json({ success: true, item });
      } catch (error) {
        if (error instanceof AiV2DatabaseError) {
          res.status(503).json(databaseUnavailable);
          return;
        }
        res.status(500).json(internalError);
      }
    },
    listConversations: async (_req, res): Promise<void> => {
      try {
        const items = await model.listConversations();
        res.status(200).json({ success: true, items });
      } catch (error) {
        if (error instanceof AiV2DatabaseError) {
          res.status(503).json(databaseUnavailable);
          return;
        }
        res.status(500).json(internalError);
      }
    },
    listTurns: async (req, res): Promise<void> => {
      const rawId: unknown = req.params.conversationId;
      if (typeof rawId !== 'string' || !/^[1-9][0-9]*$/.test(rawId)) {
        res.status(400).json(validationError);
        return;
      }
      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || id > 2_147_483_647) {
        res.status(400).json(validationError);
        return;
      }

      try {
        const conversation = await model.findConversation(id);
        if (!conversation) {
          res.status(404).json(conversationNotFound);
          return;
        }
        const items = await model.listTurns(id);
        res.status(200).json({ success: true, items });
      } catch (error) {
        if (error instanceof AiV2ConversationNotFoundError) {
          res.status(404).json(conversationNotFound);
          return;
        }
        if (error instanceof AiV2DatabaseError) {
          res.status(503).json(databaseUnavailable);
          return;
        }
        res.status(500).json(internalError);
      }
    },
  };
}
