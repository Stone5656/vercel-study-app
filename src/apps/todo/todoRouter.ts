import express, { type ErrorRequestHandler } from 'express';

import {
  createTodoController,
  type TodoReadWriteModel,
} from './todoController.js';
import * as todoModel from './todoModel.js';

export const todoJsonErrorHandler: ErrorRequestHandler = (
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
    res.status(400).json({
      status: 'error',
      code: 'BAD_REQUEST',
      message: 'JSON の形式が不正です',
      details: [],
    });
    return;
  }

  next(error);
};

export function createTodoRouter(model: TodoReadWriteModel = todoModel) {
  const router = express.Router();
  const controller = createTodoController(model);

  router.get('/todo', (_req, res) => {
    res.render('todo/index', { title: 'TODO一覧' });
  });
  router.get('/api/v1/todos', controller.list);
  router.post('/api/v1/todos', controller.create);
  router.patch('/api/v1/todos/:id', controller.update);
  router.delete('/api/v1/todos/:id', controller.remove);

  return router;
}
