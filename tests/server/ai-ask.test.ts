import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createAiDemoGuard } from '../../src/apps/ai/aiMiddleware.js';
import {
  AiDatabaseError,
  createAiHistoryModel,
  type AiHistoryItem,
  type AiHistoryModel,
  type AiHistoryRow,
} from '../../src/apps/ai/aiModel.js';
import { createAiRouter } from '../../src/apps/ai/aiRouter.js';
import {
  createLocalMockGuard,
  type AiAnswerService,
} from '../../src/apps/ai/aiService.js';

const enabledEnvironment = {
  AI_DEMO_ENABLED: 'true',
  VERCEL_ENV: 'preview',
};

const allowMock: RequestHandler = (_req, _res, next): void => next();

const savedItem: AiHistoryItem = {
  id: 27,
  prompt: '保存の仕組みを説明してください',
  response: '接続確認用の模擬回答',
  createdAt: '2026-11-18T04:00:00.000Z',
};

function createAskApp(
  options: {
    historyModel?: AiHistoryModel;
    demoEnvironment?: NodeJS.ProcessEnv;
    mockGuard?: RequestHandler;
    service?: AiAnswerService;
    save?: (prompt: string, response: string) => Promise<AiHistoryItem>;
  } = {},
) {
  const historyModel = options.historyModel ?? {
    async listHistory() {
      return [];
    },
  };
  const app = express();
  app.use(
    createAiRouter(
      createAiDemoGuard(options.demoEnvironment ?? enabledEnvironment),
      historyModel,
      options.mockGuard ?? allowMock,
      options.service ?? {
        async generateAnswer() {
          return '接続確認用の模擬回答';
        },
      },
      options.save ?? (async () => savedItem),
    ),
  );
  app.use(express.json());
  return app;
}

describe('POST /api/ai/ask', () => {
  it('質問を回答生成・保存してから保存済みDTOを201で返す', async () => {
    const calls: string[] = [];
    const row: AiHistoryRow = {
      id: 27,
      prompt: '保存の仕組みを説明してください',
      response_text: '接続確認用の模擬回答',
      created_at: new Date('2026-11-18T04:00:00.000Z'),
    };
    const model = createAiHistoryModel(
      async () => [],
      async (prompt, response) => {
        calls.push('save');
        assert.equal(prompt, row.prompt);
        assert.equal(response, row.response_text);
        return row;
      },
    );
    const app = createAskApp({
      historyModel: model,
      service: {
        async generateAnswer(prompt) {
          calls.push('generate');
          assert.equal(prompt, row.prompt);
          return row.response_text;
        },
      },
      save: model.saveQuestionAnswer,
    });

    const response = await request(app)
      .post('/api/ai/ask')
      .send({ prompt: row.prompt });

    assert.deepEqual(calls, ['generate', 'save']);
    assert.equal(response.status, 201);
    assert.deepEqual(response.body, { success: true, item: savedItem });
  });

  it('INSERT相当の保存Promiseが完了するまで201を返さない', async () => {
    let markSaveStarted: () => void = () => {};
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    let finishSave: (item: AiHistoryItem) => void = () => {};
    const app = createAskApp({
      service: {
        async generateAnswer() {
          return '回答';
        },
      },
      save: () => {
        markSaveStarted();
        return new Promise<AiHistoryItem>((resolve) => {
          finishSave = resolve;
        });
      },
    });

    let responseReceived = false;
    const responsePromise = request(app)
      .post('/api/ai/ask')
      .send({ prompt: '質問' })
      .then((response) => {
        responseReceived = true;
        return response;
      });

    await saveStarted;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(responseReceived, false);

    finishSave(savedItem);
    const response = await responsePromise;
    assert.equal(response.status, 201);
    assert.equal(responseReceived, true);
  });

  it('前後の空白を除去してからServiceと保存Modelへ渡す', async () => {
    const calls: string[] = [];
    const app = createAskApp({
      service: {
        async generateAnswer(prompt) {
          calls.push(`service:${prompt}`);
          return '回答';
        },
      },
      save: async (prompt) => {
        calls.push(`model:${prompt}`);
        return { ...savedItem, prompt };
      },
    });

    const response = await request(app)
      .post('/api/ai/ask')
      .send({ prompt: '  質問本文  ' });

    assert.equal(response.status, 201);
    assert.deepEqual(calls, ['service:質問本文', 'model:質問本文']);
    assert.equal(response.body.item.prompt, '質問本文');
  });

  it('不正入力ではServiceとModelを呼び出さない', async () => {
    let serviceCalls = 0;
    let modelCalls = 0;
    const app = createAskApp({
      service: {
        async generateAnswer() {
          serviceCalls += 1;
          return '回答';
        },
      },
      save: async () => {
        modelCalls += 1;
        return savedItem;
      },
    });

    for (const body of [{}, { prompt: 5 }, { prompt: '   ' }]) {
      const response = await request(app).post('/api/ai/ask').send(body);
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    }
    const nonObject = await request(app)
      .post('/api/ai/ask')
      .set('Content-Type', 'application/json')
      .send('null');
    assert.equal(nonObject.status, 400);
    assert.equal(nonObject.body.error.code, 'VALIDATION_ERROR');

    assert.equal(serviceCalls, 0);
    assert.equal(modelCalls, 0);
  });

  it('2,000 Unicodeコードポイントを受け入れ、2,001を拒否する', async () => {
    let receivedPrompt = '';
    const app = createAskApp({
      service: {
        async generateAnswer(prompt) {
          receivedPrompt = prompt;
          return '回答';
        },
      },
    });

    const accepted = await request(app)
      .post('/api/ai/ask')
      .send({ prompt: '😀'.repeat(2000) });
    const rejected = await request(app)
      .post('/api/ai/ask')
      .send({ prompt: '😀'.repeat(2001) });

    assert.equal(accepted.status, 201);
    assert.equal(Array.from(receivedPrompt).length, 2000);
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.code, 'VALIDATION_ERROR');
  });

  it('不正JSONを400 INVALID_JSONで返す', async () => {
    const response = await request(createAskApp())
      .post('/api/ai/ask')
      .set('Content-Type', 'application/json')
      .send('{"prompt":');

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'INVALID_JSON');
  });

  it('16,384バイトを超えるJSON本文を413で返す', async () => {
    const response = await request(createAskApp())
      .post('/api/ai/ask')
      .send({ prompt: '質問', extra: 'x'.repeat(16_384) });

    assert.equal(response.status, 413);
    assert.equal(response.body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  it('非JSON Content-Typeを415で返す', async () => {
    const response = await request(createAskApp())
      .post('/api/ai/ask')
      .type('text')
      .send('prompt=question');

    assert.equal(response.status, 415);
    assert.equal(response.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('Service失敗または空回答では保存せず502を返す', async () => {
    let saveCalls = 0;
    for (const service of [
      {
        async generateAnswer(): Promise<string> {
          throw new Error('private provider detail');
        },
      },
      {
        async generateAnswer(): Promise<string> {
          return '   ';
        },
      },
    ]) {
      const response = await request(
        createAskApp({
          service,
          save: async () => {
            saveCalls += 1;
            return savedItem;
          },
        }),
      )
        .post('/api/ai/ask')
        .send({ prompt: '質問' });

      assert.equal(response.status, 502);
      assert.equal(response.body.error.code, 'AI_UNAVAILABLE');
      assert.equal(JSON.stringify(response.body).includes('private'), false);
    }
    assert.equal(saveCalls, 0);
  });

  it('DB保存失敗は503で、模擬回答だけを成功として返さない', async () => {
    const response = await request(
      createAskApp({
        save: async () => {
          throw new AiDatabaseError({
            cause: new Error('private connection detail'),
          });
        },
      }),
    )
      .post('/api/ai/ask')
      .send({ prompt: '質問' });

    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'DB_UNAVAILABLE');
    assert.equal('item' in response.body, false);
    assert.equal(JSON.stringify(response.body).includes('private'), false);
  });

  it('デモ停止中はServiceとModelを呼び出さない', async () => {
    let serviceCalls = 0;
    let modelCalls = 0;
    const response = await request(
      createAskApp({
        demoEnvironment: { AI_DEMO_ENABLED: 'false' },
        service: {
          async generateAnswer() {
            serviceCalls += 1;
            return '回答';
          },
        },
        save: async () => {
          modelCalls += 1;
          return savedItem;
        },
      }),
    )
      .post('/api/ai/ask')
      .send({ prompt: '質問' });

    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'DEMO_DISABLED');
    assert.equal(serviceCalls, 0);
    assert.equal(modelCalls, 0);
  });

  it('Productionではデモフラグがtrueでも停止する', async () => {
    let serviceCalls = 0;
    const response = await request(
      createAskApp({
        demoEnvironment: {
          AI_DEMO_ENABLED: 'true',
          VERCEL_ENV: 'production',
        },
        service: {
          async generateAnswer() {
            serviceCalls += 1;
            return 'must not be called';
          },
        },
      }),
    )
      .post('/api/ai/ask')
      .send({ prompt: '質問' });

    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'DEMO_DISABLED');
    assert.equal(serviceCalls, 0);
  });

  it('模擬回答は明示的なローカル設定なしに使用できない', async () => {
    const app = createAskApp({
      mockGuard: createLocalMockGuard({
        AI_DEMO_ENABLED: 'true',
      }),
    });
    const response = await request(app)
      .post('/api/ai/ask')
      .send({ prompt: '質問' });

    assert.equal(response.status, 502);
    assert.equal(response.body.error.code, 'AI_UNAVAILABLE');
  });
});
