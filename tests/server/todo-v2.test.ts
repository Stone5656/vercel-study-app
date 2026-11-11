import assert from 'node:assert/strict';
import express from 'express';
import { describe, it } from 'node:test';

import request from 'supertest';

import { todoJsonErrorHandler } from '../../src/apps/todo/todoRouter.js';
import { createTodoRouterV2 } from '../../src/apps/todo/v2/todoRouterV2.js';
import type {
  TodoModelV2,
  TodoPriority,
  TodoV2,
} from '../../src/apps/todo/v2/todoModelV2.js';

function createFakeModel(): TodoModelV2 {
  const todos = new Map<number, TodoV2>();
  let nextId = 1;

  return {
    async listTodosV2() {
      return [...todos.values()].sort((left, right) => left.id - right.id);
    },
    async createTodoV2(title, priority) {
      const todo: TodoV2 = {
        id: nextId++,
        title,
        isCompleted: false,
        priority,
        createdAt: '2026-11-11T00:00:00.000Z',
      };
      todos.set(todo.id, todo);
      return { ...todo };
    },
    async updateTodoV2(id, changes) {
      const todo = todos.get(id);
      if (!todo) return null;
      const updated = { ...todo, ...changes };
      todos.set(id, updated);
      return { ...updated };
    },
    async deleteTodoV2(id) {
      return todos.delete(id);
    },
  };
}

function createTestApp(model: TodoModelV2 = createFakeModel()) {
  const app = express();
  app.use(express.json());
  app.use(createTodoRouterV2(model));
  app.use(todoJsonErrorHandler);
  return app;
}

describe('TODO V2 CRUD API', () => {
  it('一覧は空配列を返す', async () => {
    const response = await request(createTestApp()).get('/api/v2/todos');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'success', data: [] });
  });

  it('priority省略時はnormalで登録する', async () => {
    const response = await request(createTestApp())
      .post('/api/v2/todos')
      .send({ title: '  V2 task  ' });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.title, 'V2 task');
    assert.equal(response.body.data.priority, 'normal');
    assert.equal(response.body.data.isCompleted, false);
    assert.equal(typeof response.body.data.createdAt, 'string');
  });

  it('low / normal / high の各優先度で登録する', async () => {
    const app = createTestApp();
    for (const priority of ['low', 'normal', 'high'] satisfies TodoPriority[]) {
      const response = await request(app)
        .post('/api/v2/todos')
        .send({ title: `priority-${priority}`, priority });
      assert.equal(response.status, 201);
      assert.equal(response.body.data.priority, priority);
    }
  });

  it('title欠落・型違いは400、空白・101文字は422', async () => {
    const app = createTestApp();
    for (const body of [{}, { title: 1 }]) {
      const response = await request(app).post('/api/v2/todos').send(body);
      assert.equal(response.status, 400);
    }
    for (const title of ['  ', 'a'.repeat(101)]) {
      const response = await request(app).post('/api/v2/todos').send({ title });
      assert.equal(response.status, 422);
    }
  });

  it('priority不正値は422、型違いは400', async () => {
    const app = createTestApp();
    const invalid = await request(app)
      .post('/api/v2/todos')
      .send({ title: 'x', priority: 'urgent' });
    const wrongType = await request(app)
      .post('/api/v2/todos')
      .send({ title: 'x', priority: 1 });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.code, 'VALIDATION_ERROR');
    assert.equal(wrongType.status, 400);
  });

  it('完了状態・優先度を個別および同時に更新する', async () => {
    const app = createTestApp();
    const created = await request(app)
      .post('/api/v2/todos')
      .send({ title: 'update me' });
    const id = created.body.data.id;

    const priorityResponse = await request(app)
      .patch(`/api/v2/todos/${id}`)
      .send({ priority: 'high' });
    assert.equal(priorityResponse.status, 200);
    assert.equal(priorityResponse.body.data.priority, 'high');

    const bothResponse = await request(app)
      .patch(`/api/v2/todos/${id}`)
      .send({ isCompleted: true, priority: 'low' });
    assert.equal(bothResponse.status, 200);
    assert.equal(bothResponse.body.data.isCompleted, true);
    assert.equal(bothResponse.body.data.priority, 'low');
  });

  it('PATCH空オブジェクトは400、不正priorityは422', async () => {
    const app = createTestApp();
    const empty = await request(app).patch('/api/v2/todos/1').send({});
    const priority = await request(app)
      .patch('/api/v2/todos/1')
      .send({ priority: 'urgent' });
    assert.equal(empty.status, 400);
    assert.equal(priority.status, 422);
  });

  it('ID形式不正は400、存在しないIDは404', async () => {
    const app = createTestApp();
    assert.equal(
      (await request(app).patch('/api/v2/todos/0').send({ priority: 'low' }))
        .status,
      400,
    );
    assert.equal(
      (await request(app).patch('/api/v2/todos/99').send({ priority: 'low' }))
        .status,
      404,
    );
    assert.equal((await request(app).delete('/api/v2/todos/1.2')).status, 400);
    assert.equal((await request(app).delete('/api/v2/todos/99')).status, 404);
  });

  it('削除成功は204で本文なし', async () => {
    const app = createTestApp();
    const created = await request(app)
      .post('/api/v2/todos')
      .send({ title: 'delete me' });
    const response = await request(app).delete(
      `/api/v2/todos/${created.body.data.id}`,
    );
    assert.equal(response.status, 204);
    assert.equal(response.text, '');
  });

  it('不正JSONはV1と同じエラーJSON', async () => {
    const response = await request(createTestApp())
      .post('/api/v2/todos')
      .set('Content-Type', 'application/json')
      .send('{');
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      status: 'error',
      code: 'BAD_REQUEST',
      message: 'JSON の形式が不正です',
      details: [],
    });
  });

  it('DB利用不可を503で返し詳細を含めない', async () => {
    const model: TodoModelV2 = {
      async listTodosV2() {
        throw Object.assign(new Error('private detail'), {
          code: 'ECONNREFUSED',
        });
      },
      async createTodoV2() {
        throw Object.assign(new Error('private detail'), {
          code: 'ECONNREFUSED',
        });
      },
      async updateTodoV2() {
        throw Object.assign(new Error('private detail'), {
          code: 'ECONNREFUSED',
        });
      },
      async deleteTodoV2() {
        throw Object.assign(new Error('private detail'), {
          code: 'ECONNREFUSED',
        });
      },
    };
    const response = await request(createTestApp(model)).get('/api/v2/todos');
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'DB_UNAVAILABLE');
    assert.equal(JSON.stringify(response.body).includes('private'), false);
  });
});
