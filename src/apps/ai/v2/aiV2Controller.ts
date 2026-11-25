import type { RequestHandler } from 'express';

import {
  AiV2ContextChangedError,
  AiV2ConversationNotFoundError,
  AiV2DatabaseError,
  aiV2Model,
  type AiV2Model,
} from './aiV2Model.js';
import {
  createAiV2GeminiAnswerService,
  type AiV2AnswerService,
} from './aiV2Service.js';

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

const aiUnavailable = {
  success: false,
  error: {
    code: 'AI_UNAVAILABLE',
    message: 'AI回答を取得できませんでした',
  },
} as const;

const conversationChanged = {
  success: false,
  error: {
    code: 'CONVERSATION_CHANGED',
    message: '会話が更新されました。履歴を確認してください',
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

function getPrompt(body: unknown): string | null {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    !('prompt' in body) ||
    typeof body.prompt !== 'string'
  ) {
    return null;
  }

  const prompt = body.prompt.trim();
  const length = Array.from(prompt).length;
  return length >= 1 && length <= 2000 ? prompt : null;
}

export function parseAiV2ConversationId(rawId: unknown): number | null {
  if (typeof rawId !== 'string' || !/^[1-9][0-9]*$/.test(rawId)) {
    return null;
  }
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

export function createAiV2Controller(
  model: AiV2Model = aiV2Model,
  answerService: AiV2AnswerService = createAiV2GeminiAnswerService(),
): {
  createConversation: RequestHandler;
  listConversations: RequestHandler;
  listTurns: RequestHandler;
  ask: RequestHandler;
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
      const id = parseAiV2ConversationId(req.params.conversationId);
      if (id === null) {
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
    ask: async (req, res): Promise<void> => {
      const id = parseAiV2ConversationId(req.params.conversationId);
      const prompt = getPrompt(req.body as unknown);
      if (id === null || prompt === null) {
        res.status(400).json(validationError);
        return;
      }

      let context;
      try {
        context = await model.getContext(id);
      } catch (error) {
        if (error instanceof AiV2DatabaseError) {
          res.status(503).json(databaseUnavailable);
          return;
        }
        res.status(500).json(internalError);
        return;
      }
      if (!context) {
        res.status(404).json(conversationNotFound);
        return;
      }

      let answer: string;
      try {
        answer = await answerService.generateAnswer(prompt, context);
        if (answer.trim().length === 0) {
          throw new Error('Gemini returned an empty answer');
        }
      } catch {
        res.status(502).json(aiUnavailable);
        return;
      }

      try {
        const item = await model.saveTurnIfContextCurrent(
          id,
          prompt,
          answer,
          context.latestTurnId,
        );
        res.status(201).json({ success: true, item });
      } catch (error) {
        if (error instanceof AiV2ContextChangedError) {
          res.status(409).json(conversationChanged);
          return;
        }
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
