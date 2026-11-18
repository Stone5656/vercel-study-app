import assert from 'node:assert/strict';
import express from 'express';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createAiDemoGuard } from '../../src/apps/ai/aiMiddleware.js';
import {
  AI_HISTORY_SELECT_SQL,
  AiDatabaseError,
  createAiHistoryModel,
  type AiHistoryItem,
  type AiHistoryModel,
  type AiHistoryRow,
} from '../../src/apps/ai/aiModel.js';
import { createAiRouter } from '../../src/apps/ai/aiRouter.js';

function createTestApp(
  model: AiHistoryModel,
  environment: NodeJS.ProcessEnv = {
    AI_DEMO_ENABLED: 'true',
    VERCEL_ENV: 'preview',
  },
) {
  const app = express();
  app.use(createAiRouter(createAiDemoGuard(environment), model));
  return app;
}

function createStaticModel(items: AiHistoryItem[]): AiHistoryModel {
  return {
    async listHistory() {
      return items;
    },
  };
}

describe('GET /api/ai/history', () => {
  it('履歴0件を200と空配列で返す', async () => {
    const response = await request(createTestApp(createStaticModel([]))).get(
      '/api/ai/history',
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      items: [],
    });
  });

  it('履歴を公開用DTO形式で返す', async () => {
    const item: AiHistoryItem = {
      id: 1,
      prompt: '質問本文',
      response: '回答本文',
      createdAt: '2026-11-18T04:00:00.000Z',
    };
    const response = await request(
      createTestApp(createStaticModel([item])),
    ).get('/api/ai/history');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      items: [item],
    });
  });

  it('Modelは固定SQLで新しい順の最大20件をDTOへ変換する', async () => {
    const rows: AiHistoryRow[] = Array.from({ length: 21 }, (_, index) => ({
      id: 21 - index,
      prompt: `質問${index + 1}`,
      response_text: `回答${index + 1}`,
      created_at: new Date(Date.UTC(2026, 10, 18, 4, 0, 21 - index)),
    }));
    const model = createAiHistoryModel(async () => rows);

    const items = await model.listHistory();

    assert.equal(items.length, 20);
    assert.deepEqual(items[0], {
      id: 21,
      prompt: '質問1',
      response: '回答1',
      createdAt: '2026-11-18T04:00:21.000Z',
    });
    assert.match(
      AI_HISTORY_SELECT_SQL,
      /ORDER BY created_at DESC, id DESC\s+LIMIT 20/,
    );
  });

  it('DB接続失敗を503へ変換し内部情報を返さない', async () => {
    const model: AiHistoryModel = {
      async listHistory() {
        throw new AiDatabaseError({
          cause: new Error('postgres://secret@hidden.example/database'),
        });
      },
    };
    const response = await request(createTestApp(model)).get('/api/ai/history');

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      success: false,
      error: {
        code: 'DB_UNAVAILABLE',
        message: 'データベースを利用できません',
      },
    });
    assert.equal(JSON.stringify(response.body).includes('secret'), false);
  });

  it('想定外の例外を安全な500へ変換する', async () => {
    const model: AiHistoryModel = {
      async listHistory() {
        throw new Error('unexpected internal details');
      },
    };
    const response = await request(createTestApp(model)).get('/api/ai/history');

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '内部エラーが発生しました',
      },
    });
    assert.equal(JSON.stringify(response.body).includes('unexpected'), false);
  });

  it('デモ停止時はModelを呼ばず503を返す', async () => {
    let calls = 0;
    const model: AiHistoryModel = {
      async listHistory() {
        calls += 1;
        return [];
      },
    };
    const response = await request(
      createTestApp(model, { AI_DEMO_ENABLED: 'false' }),
    ).get('/api/ai/history');

    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'DEMO_DISABLED');
    assert.equal(calls, 0);
  });

  it('ProductionではフラグがtrueでもModelを呼ばず503を返す', async () => {
    let calls = 0;
    const model: AiHistoryModel = {
      async listHistory() {
        calls += 1;
        return [];
      },
    };
    const response = await request(
      createTestApp(model, {
        AI_DEMO_ENABLED: 'true',
        VERCEL_ENV: 'production',
      }),
    ).get('/api/ai/history');

    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'DEMO_DISABLED');
    assert.equal(calls, 0);
  });
});
