import type { Request, Response } from 'express';

import type { Todo } from './todoModel.js';

export type TodoReadWriteModel = {
  listTodos(): Promise<Todo[]>;
  createTodo(title: string): Promise<Todo>;
};

type ApiErrorCode =
  'BAD_REQUEST' | 'VALIDATION_ERROR' | 'DB_UNAVAILABLE' | 'INTERNAL_ERROR';

function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
): void {
  res.status(status).json({
    status: 'error',
    code,
    message,
    details: [],
  });
}

function isDatabaseUnavailable(error: unknown): boolean {
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

export function createTodoController(model: TodoReadWriteModel) {
  return {
    async list(_req: Request, res: Response): Promise<void> {
      try {
        const todos = await model.listTodos();
        res.status(200).json({ status: 'success', data: todos });
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
      if (normalizedTitle.length < 1 || normalizedTitle.length > 100) {
        sendError(
          res,
          422,
          'VALIDATION_ERROR',
          'title は1～100文字で指定してください',
        );
        return;
      }

      try {
        const todo = await model.createTodo(normalizedTitle);
        res.status(201).json({ status: 'success', data: todo });
      } catch (error) {
        sendServerError(res, error);
      }
    },
  };
}
