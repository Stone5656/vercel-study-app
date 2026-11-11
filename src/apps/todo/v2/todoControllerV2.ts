import type { Request, Response } from 'express';

import type {
  TodoModelV2,
  TodoPriority,
  TodoV2Changes,
} from './todoModelV2.js';

const priorities = ['low', 'normal', 'high'] as const;

type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'DB_UNAVAILABLE';

function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
): void {
  res.status(status).json({ status: 'error', code, message, details: [] });
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (
    error instanceof Error &&
    error.message.startsWith('DATABASE_URL is not set.')
  ) {
    return true;
  }
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }

  const code = String(error.code);
  return (
    code.startsWith('08') ||
    code.startsWith('ECONN') ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === '57P01' ||
    code === '53300'
  );
}

function sendServerError(res: Response, error: unknown): void {
  if (isDatabaseUnavailable(error)) {
    sendError(res, 503, 'DB_UNAVAILABLE', 'データベースを利用できません');
    return;
  }
  sendError(res, 500, 'INTERNAL_ERROR', '内部エラーが発生しました');
}

function parseTodoId(value: string | string[]): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isPriority(value: unknown): value is TodoPriority {
  return (
    typeof value === 'string' && priorities.includes(value as TodoPriority)
  );
}

export function createTodoControllerV2(model: TodoModelV2) {
  return {
    async list(_req: Request, res: Response): Promise<void> {
      try {
        res.status(200).json({
          status: 'success',
          data: await model.listTodosV2(),
        });
      } catch (error) {
        sendServerError(res, error);
      }
    },

    async create(req: Request, res: Response): Promise<void> {
      const body: unknown = req.body;
      if (!body || typeof body !== 'object' || !('title' in body)) {
        sendError(res, 400, 'BAD_REQUEST', 'title を指定してください');
        return;
      }

      const { title } = body;
      if (typeof title !== 'string') {
        sendError(res, 400, 'BAD_REQUEST', 'title は文字列で指定してください');
        return;
      }
      const normalizedTitle = title.trim();
      if (!normalizedTitle || normalizedTitle.length > 100) {
        sendError(
          res,
          422,
          'VALIDATION_ERROR',
          'title は1～100文字で指定してください',
        );
        return;
      }

      let priority: TodoPriority = 'normal';
      if ('priority' in body) {
        if (typeof body.priority !== 'string') {
          sendError(
            res,
            400,
            'BAD_REQUEST',
            'priority は文字列で指定してください',
          );
          return;
        }
        if (!isPriority(body.priority)) {
          sendError(res, 422, 'VALIDATION_ERROR', 'priority の値が不正です');
          return;
        }
        priority = body.priority;
      }

      try {
        const todo = await model.createTodoV2(normalizedTitle, priority);
        res.status(201).json({ status: 'success', data: todo });
      } catch (error) {
        sendServerError(res, error);
      }
    },

    async update(req: Request, res: Response): Promise<void> {
      const id = parseTodoId(req.params.id ?? '');
      if (id === null) {
        sendError(
          res,
          400,
          'BAD_REQUEST',
          'ID は1以上の整数で指定してください',
        );
        return;
      }

      const body: unknown = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        sendError(res, 400, 'BAD_REQUEST', '更新内容を指定してください');
        return;
      }

      const keys = Object.keys(body);
      if (
        keys.length === 0 ||
        keys.some((key) => !['isCompleted', 'priority'].includes(key))
      ) {
        sendError(res, 400, 'BAD_REQUEST', '更新内容を正しく指定してください');
        return;
      }

      const changes: TodoV2Changes = {};
      if ('isCompleted' in body) {
        if (typeof body.isCompleted !== 'boolean') {
          sendError(
            res,
            400,
            'BAD_REQUEST',
            'isCompleted は boolean で指定してください',
          );
          return;
        }
        changes.isCompleted = body.isCompleted;
      }
      if ('priority' in body) {
        if (typeof body.priority !== 'string') {
          sendError(
            res,
            400,
            'BAD_REQUEST',
            'priority は文字列で指定してください',
          );
          return;
        }
        if (!isPriority(body.priority)) {
          sendError(res, 422, 'VALIDATION_ERROR', 'priority の値が不正です');
          return;
        }
        changes.priority = body.priority;
      }

      try {
        const todo = await model.updateTodoV2(id, changes);
        if (!todo) {
          sendError(res, 404, 'NOT_FOUND', 'TODO が見つかりません');
          return;
        }
        res.status(200).json({ status: 'success', data: todo });
      } catch (error) {
        sendServerError(res, error);
      }
    },

    async remove(req: Request, res: Response): Promise<void> {
      const id = parseTodoId(req.params.id ?? '');
      if (id === null) {
        sendError(
          res,
          400,
          'BAD_REQUEST',
          'ID は1以上の整数で指定してください',
        );
        return;
      }

      try {
        if (!(await model.deleteTodoV2(id))) {
          sendError(res, 404, 'NOT_FOUND', 'TODO が見つかりません');
          return;
        }
        res.status(204).end();
      } catch (error) {
        sendServerError(res, error);
      }
    },
  };
}
