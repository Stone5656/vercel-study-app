import assert from 'node:assert/strict';
import express from 'express';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createAiDemoGuard } from '../../src/apps/ai/aiMiddleware.js';
import type { AiHistoryModel } from '../../src/apps/ai/aiModel.js';
import { createAiRouter } from '../../src/apps/ai/aiRouter.js';
import type { AiAnswerService } from '../../src/apps/ai/aiService.js';
import {
  createTodoRouter,
  todoJsonErrorHandler,
} from '../../src/apps/todo/todoRouter.js';

const disabledBody = {
  success: false,
  error: {
    code: 'DEMO_DISABLED',
    message: 'AI質問機能は現在利用できません',
  },
};

function createTestApp(environment: NodeJS.ProcessEnv) {
  const app = express();
  const historyModel: AiHistoryModel = {
    async listHistory() {
      return [];
    },
  };
  const serviceGuard = (_req: express.Request, res: express.Response): void => {
    res.status(502).json({
      success: false,
      error: {
        code: 'AI_UNAVAILABLE',
        message: 'AI回答機能を利用できません',
      },
    });
  };
  const fakeService: AiAnswerService = {
    async generateAnswer() {
      return 'fake answer';
    },
  };
  app.use(
    createAiRouter(
      createAiDemoGuard(environment),
      historyModel,
      serviceGuard,
      fakeService,
      async () => {
        throw new Error('save should not run');
      },
    ),
  );
  return app;
}

describe('AI demo guard', () => {
  it('AI_DEMO_ENABLEDが未設定またはfalseなら両APIを503で停止する', async () => {
    for (const environment of [{}, { AI_DEMO_ENABLED: 'false' }]) {
      const app = createTestApp(environment);
      const ask = await request(app).post('/api/ai/ask');
      const history = await request(app).get('/api/ai/history');

      assert.equal(ask.status, 503);
      assert.deepEqual(ask.body, disabledBody);
      assert.equal(history.status, 503);
      assert.deepEqual(history.body, disabledBody);
    }
  });

  it('ProductionではAI_DEMO_ENABLED=trueでも両APIを停止する', async () => {
    const app = createTestApp({
      AI_DEMO_ENABLED: 'true',
      VERCEL_ENV: 'production',
    });

    assert.equal((await request(app).post('/api/ai/ask')).status, 503);
    assert.equal((await request(app).get('/api/ai/history')).status, 503);
  });

  it('Production以外で明示的にtrueなら後続処理へ進める', async () => {
    const app = createTestApp({
      AI_DEMO_ENABLED: 'true',
      VERCEL_ENV: 'preview',
    });

    const ask = await request(app)
      .post('/api/ai/ask')
      .set('Content-Type', 'application/json')
      .send({ prompt: 'question' });
    assert.equal(ask.status, 502);
    assert.equal(ask.body.error.code, 'AI_UNAVAILABLE');
    assert.equal((await request(app).get('/api/ai/history')).status, 200);
  });

  it('AI機能停止中もTODO APIと既存JSONエラー契約が動作する', async () => {
    const app = express();
    app.use(createAiRouter(createAiDemoGuard({ AI_DEMO_ENABLED: 'false' })));
    app.use(express.json());
    app.use(
      createTodoRouter({
        async listTodos() {
          return [];
        },
        async createTodo(title) {
          return {
            id: 101,
            title,
            isCompleted: false,
            createdAt: '2026-11-18T04:00:00.000Z',
          };
        },
        async setTodoCompletion() {
          return null;
        },
        async deleteTodo() {
          return false;
        },
      }),
    );
    app.use(todoJsonErrorHandler);

    const created = await request(app)
      .post('/api/v1/todos')
      .send({ title: 'TODO while AI is disabled' });
    const invalidJson = await request(app)
      .post('/api/v1/todos')
      .set('Content-Type', 'application/json')
      .send('{invalid');

    assert.equal(created.status, 201);
    assert.equal(created.body.data.title, 'TODO while AI is disabled');
    assert.equal(invalidJson.status, 400);
    assert.equal(invalidJson.body.code, 'BAD_REQUEST');
  });
});
