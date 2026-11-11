import express from 'express';

import { createTodoControllerV2 } from './todoControllerV2.js';
import * as todoModelV2 from './todoModelV2.js';
import type { TodoModelV2 } from './todoModelV2.js';

export function createTodoRouterV2(model: TodoModelV2 = todoModelV2) {
  const router = express.Router();
  const controller = createTodoControllerV2(model);

  router.get('/api/v2/todos', controller.list);
  router.post('/api/v2/todos', controller.create);
  router.patch('/api/v2/todos/:id', controller.update);
  router.delete('/api/v2/todos/:id', controller.remove);

  return router;
}
