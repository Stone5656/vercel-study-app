import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createGeminiAnswerService,
  MOCK_ANSWER,
  mockAiAnswerService,
  selectAiAnswerService,
  type GeminiClient,
} from '../../src/apps/ai/aiService.js';

function createFakeClient(
  response: { text?: string } | Error,
  capture?: (parameters: unknown) => void,
): GeminiClient {
  return {
    models: {
      async generateContent(parameters) {
        capture?.(parameters);
        if (response instanceof Error) {
          throw response;
        }
        return response;
      },
    },
  };
}

describe('Gemini answer service', () => {
  it('固定モデル設定で現在の質問だけを送り回答文字列を返す', async () => {
    let parameters: unknown;
    let requestedApiKey: string | undefined;
    const service = createGeminiAnswerService({
      environment: {
        GEMINI_API_KEY: 'test-key-never-logged',
        GEMINI_MODEL: 'gemini-3.5-flash-lite',
      },
      createClient(apiKey) {
        requestedApiKey = apiKey;
        return createFakeClient({ text: '回答本文' }, (value) => {
          parameters = value;
        });
      },
      logFailure() {
        assert.fail('正常時に失敗ログを出してはいけない');
      },
    });

    assert.equal(await service.generateAnswer('現在の質問'), '回答本文');
    assert.equal(requestedApiKey, 'test-key-never-logged');
    assert.deepEqual(parameters, {
      model: 'gemini-3.5-flash-lite',
      contents: '現在の質問',
      config: {
        maxOutputTokens: 1024,
        automaticContinuation: false,
        automaticFunctionCalling: { disable: true },
        httpOptions: {
          timeout: 30_000,
          retryOptions: { attempts: 1 },
        },
      },
    });
    assert.equal(JSON.stringify(parameters).includes('history'), false);
  });

  it('未設定のAPI keyまたはmodelで安全に失敗する', async () => {
    let clientCalls = 0;
    const service = createGeminiAnswerService({
      environment: {},
      createClient() {
        clientCalls += 1;
        return createFakeClient({ text: '回答' });
      },
      logFailure() {},
    });

    await assert.rejects(service.generateAnswer('質問'));
    assert.equal(clientCalls, 0);
  });

  it('空回答と応答text欠落を失敗として扱う', async () => {
    for (const response of [{ text: '' }, { text: '   ' }, {}]) {
      let logged = 0;
      const service = createGeminiAnswerService({
        environment: {
          GEMINI_API_KEY: 'test-key',
          GEMINI_MODEL: 'gemini-3.5-flash-lite',
        },
        createClient: () => createFakeClient(response),
        logFailure: () => {
          logged += 1;
        },
      });

      await assert.rejects(service.generateAnswer('質問'));
      assert.equal(logged, 1);
    }
  });

  it('API通信エラーとtimeoutを汎用例外に変換し、秘密や本文をログに含めない', async () => {
    let logged = 0;
    const service = createGeminiAnswerService({
      environment: {
        GEMINI_API_KEY: 'secret-api-key',
        GEMINI_MODEL: 'gemini-3.5-flash-lite',
      },
      createClient: () => createFakeClient(new Error('timeout secret prompt')),
      logFailure: () => {
        logged += 1;
      },
    });

    await assert.rejects(service.generateAnswer('private question'), {
      message: 'Gemini request failed',
    });
    assert.equal(logged, 1);
  });

  it('明示したローカルmock設定なら既存の固定回答Serviceを選ぶ', async () => {
    const selected = selectAiAnswerService({
      AI_DEMO_ENABLED: 'true',
      AI_MOCK_ENABLED: 'true',
    });

    assert.equal(selected, mockAiAnswerService);
    assert.equal(await selected.generateAnswer('質問'), MOCK_ANSWER);
  });

  it('mock設定が無効ならGemini Serviceを選び、Previewではmockに切り替えない', async () => {
    const localReal = selectAiAnswerService({
      AI_MOCK_ENABLED: 'false',
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'gemini-3.5-flash-lite',
    });
    const preview = selectAiAnswerService({
      AI_MOCK_ENABLED: 'true',
      VERCEL_ENV: 'preview',
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'gemini-3.5-flash-lite',
    });

    assert.notEqual(localReal, mockAiAnswerService);
    assert.notEqual(preview, mockAiAnswerService);
  });
});
