import assert from 'node:assert/strict';
import express from 'express';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createAiDemoGuard } from '../../src/apps/ai/aiMiddleware.js';
import type { AiHistoryModel } from '../../src/apps/ai/aiModel.js';
import { createAiRouter } from '../../src/apps/ai/aiRouter.js';

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
  app.use(createAiRouter(createAiDemoGuard(environment), historyModel));
  app.post('/api/ai/ask', (_req, res) => res.sendStatus(204));
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

    assert.equal((await request(app).post('/api/ai/ask')).status, 204);
    assert.equal((await request(app).get('/api/ai/history')).status, 200);
  });
});
