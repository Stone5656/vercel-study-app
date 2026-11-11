import type { Request, Response } from 'express';

import type { Todo } from './todoModel.js';

export type TodoReadWriteModel = {
  listTodos(): Promise<Todo[]>;
  createTodo(title: string): Promise<Todo>;
  setTodoCompletion(id: number, isCompleted: boolean): Promise<Todo | null>;
  deleteTodo(id: number): Promise<boolean>;
};

type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'DB_UNAVAILABLE'
  | 'INTERNAL_ERROR';

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

function parseTodoId(value: string | string[]): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
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
      if (!body || typeof body !== 'object' || !('isCompleted' in body)) {
        sendError(res, 400, 'BAD_REQUEST', 'isCompleted を指定してください');
        return;
      }

      const { isCompleted } = body;
      if (typeof isCompleted !== 'boolean') {
        sendError(
          res,
          400,
          'BAD_REQUEST',
          'isCompleted は boolean で指定してください',
        );
        return;
      }

      try {
        const todo = await model.setTodoCompletion(id, isCompleted);
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
        const deleted = await model.deleteTodo(id);
        if (!deleted) {
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
