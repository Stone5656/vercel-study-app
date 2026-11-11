import assert from 'node:assert/strict';
import express from 'express';
import { describe, it } from 'node:test';

import request from 'supertest';

import {
  createTodoRouter,
  todoJsonErrorHandler,
} from '../../src/apps/todo/todoRouter.js';
import type { TodoReadWriteModel } from '../../src/apps/todo/todoController.js';
import type { Todo } from '../../src/apps/todo/todoModel.js';

function createTestApp(model: TodoReadWriteModel = createFakeModel()) {
  const app = express();
  app.use(express.json());
  app.use(createTodoRouter(model));
  app.use(todoJsonErrorHandler);
  return app;
}

function createFakeModel(): TodoReadWriteModel {
  let nextId = 1;
  const todos: Todo[] = [];

  return {
    async listTodos() {
      return [...todos];
    },
    async createTodo(title) {
      const todo = {
        id: nextId++,
        title,
        isCompleted: false,
        createdAt: '2026-11-11T00:00:00.000Z',
      };
      todos.push(todo);
      return todo;
    },
    async setTodoCompletion(id, isCompleted) {
      const todo = todos.find((candidate) => candidate.id === id);
      if (!todo) {
        return null;
      }

      todo.isCompleted = isCompleted;
      return { ...todo };
    },
    async deleteTodo(id) {
      const index = todos.findIndex((candidate) => candidate.id === id);
      if (index < 0) {
        return false;
      }

      todos.splice(index, 1);
      return true;
    },
  };
}

describe('TODO GET・POST API', () => {
  it('REQ-01: 空の一覧を200と空配列で返す', async () => {
    const response = await request(createTestApp()).get('/api/v1/todos');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'success', data: [] });
  });

  it('REQ-02: trimしたタイトルを201で返す', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/todos')
      .send({ title: '  課題を提出する  ' });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body, {
      status: 'success',
      data: {
        id: 1,
        title: '課題を提出する',
        isCompleted: false,
        createdAt: '2026-11-11T00:00:00.000Z',
      },
    });
  });

  it('title欠落・型違いを400で返す', async () => {
    const app = createTestApp();

    for (const body of [{}, { title: 42 }]) {
      const response = await request(app).post('/api/v1/todos').send(body);
      assert.equal(response.status, 400);
      assert.equal(response.body.code, 'BAD_REQUEST');
    }
  });

  it('空白のみ・101文字を422で返す', async () => {
    const app = createTestApp();

    for (const title of ['   ', 'a'.repeat(101)]) {
      const response = await request(app).post('/api/v1/todos').send({ title });
      assert.equal(response.status, 422);
      assert.equal(response.body.code, 'VALIDATION_ERROR');
    }
  });

  it('不正JSONを統一エラー形式で返す', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/todos')
      .set('Content-Type', 'application/json')
      .send('{"title":');

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      status: 'error',
      code: 'BAD_REQUEST',
      message: 'JSON の形式が不正です',
      details: [],
    });
  });

  it('DB接続不能を503で返し内部エラーを含めない', async () => {
    const model: TodoReadWriteModel = {
      async listTodos() {
        throw Object.assign(new Error('hidden database details'), {
          code: 'ECONNREFUSED',
        });
      },
      async createTodo() {
        throw Object.assign(new Error('hidden database details'), {
          code: 'ECONNREFUSED',
        });
      },
      async setTodoCompletion() {
        throw Object.assign(new Error('hidden database details'), {
          code: 'ECONNREFUSED',
        });
      },
      async deleteTodo() {
        throw Object.assign(new Error('hidden database details'), {
          code: 'ECONNREFUSED',
        });
      },
    };

    const response = await request(createTestApp(model)).get('/api/v1/todos');
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'DB_UNAVAILABLE');
    assert.equal(JSON.stringify(response.body).includes('hidden'), false);
  });

  it('REQ-03: 完了状態を更新して更新後データを返す', async () => {
    const app = createTestApp();
    const created = await request(app)
      .post('/api/v1/todos')
      .send({ title: '完了する' });
    const response = await request(app)
      .patch(`/api/v1/todos/${created.body.data.id}`)
      .send({ isCompleted: true });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.isCompleted, true);
  });

  it('REQ-03: 不正なIDと存在しないIDを区別する', async () => {
    const app = createTestApp();
    const invalid = await request(app)
      .patch('/api/v1/todos/0')
      .send({ isCompleted: true });
    const missing = await request(app)
      .patch('/api/v1/todos/999')
      .send({ isCompleted: true });

    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'BAD_REQUEST');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'NOT_FOUND');
  });

  it('REQ-03: isCompletedの欠落・型違いを400で返す', async () => {
    const app = createTestApp();
    const missing = await request(app).patch('/api/v1/todos/1').send({});
    const invalid = await request(app)
      .patch('/api/v1/todos/1')
      .send({ isCompleted: 'true' });

    assert.equal(missing.status, 400);
    assert.equal(invalid.status, 400);
  });

  it('REQ-04: 自分の作成データを204本文なしで削除する', async () => {
    const app = createTestApp();
    const created = await request(app)
      .post('/api/v1/todos')
      .send({ title: '自分のテスト項目' });
    const response = await request(app).delete(
      `/api/v1/todos/${created.body.data.id}`,
    );

    assert.equal(response.status, 204);
    assert.equal(response.text, '');
  });

  it('REQ-04: 不正なIDと存在しないIDを区別する', async () => {
    const app = createTestApp();
    const invalid = await request(app).delete('/api/v1/todos/1.5');
    const missing = await request(app).delete('/api/v1/todos/999');

    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'BAD_REQUEST');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'NOT_FOUND');
  });
});
