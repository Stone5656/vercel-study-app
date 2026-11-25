import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GenerateContentParameters } from '@google/genai';

import {
  buildAiV2GeminiContents,
  createAiV2GeminiAnswerService,
  type AiV2GeminiClient,
} from '../../src/apps/ai/v2/aiV2Service.js';
import type { AiV2Context } from '../../src/apps/ai/v2/aiV2Model.js';

const context: AiV2Context = {
  latestTurnId: 9,
  turns: Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    conversationId: 42,
    prompt: `question-${index + 1}`,
    response: `answer-${index + 1}`,
    createdAt: '2026-11-25T00:00:00.000Z',
  })),
};

function fakeClient(
  result: { text?: string } | Error,
  capture: (parameters: GenerateContentParameters) => void,
): AiV2GeminiClient {
  return {
    models: {
      async generateContent(parameters) {
        capture(parameters);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

describe('AI V2 Gemini service', () => {
  it('sends only the selected conversation context latest five turns and current prompt', async () => {
    let parameters: GenerateContentParameters | undefined;
    const service = createAiV2GeminiAnswerService({
      environment: {
        GEMINI_API_KEY: 'test-only-key',
        GEMINI_MODEL: 'gemini-3.5-flash-lite',
      },
      createClient: () =>
        fakeClient({ text: 'new answer' }, (value) => {
          parameters = value;
        }),
      logFailure() {
        assert.fail('success should not log a failure');
      },
    });

    assert.equal(
      await service.generateAnswer('current prompt', context),
      'new answer',
    );
    assert.deepEqual(parameters, {
      model: 'gemini-3.5-flash-lite',
      contents: buildAiV2GeminiContents(
        { ...context, turns: context.turns.slice(-5) },
        'current prompt',
      ),
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
    const serialized = JSON.stringify(parameters);
    assert.equal(serialized.includes('question-1'), false);
    assert.equal(serialized.includes('question-2'), true);
    assert.equal(serialized.includes('current prompt'), true);
  });

  it('uses only the current prompt when history is empty', () => {
    assert.deepEqual(
      buildAiV2GeminiContents({ turns: [], latestTurnId: null }, 'now'),
      [{ role: 'user', parts: [{ text: 'now' }] }],
    );
  });

  it('fails safely when configuration is missing without creating the SDK client', async () => {
    let createCalls = 0;
    const service = createAiV2GeminiAnswerService({
      environment: {},
      createClient() {
        createCalls += 1;
        return fakeClient({ text: 'unused' }, () => undefined);
      },
      logFailure() {},
    });

    await assert.rejects(service.generateAnswer('prompt', context));
    assert.equal(createCalls, 0);
  });

  it('rejects empty and malformed replies and maps request errors without logging content', async () => {
    for (const result of [{ text: '' }, { text: '   ' }, {}]) {
      let logged = 0;
      const service = createAiV2GeminiAnswerService({
        environment: {
          GEMINI_API_KEY: 'test-only-key',
          GEMINI_MODEL: 'gemini-3.5-flash-lite',
        },
        createClient: () => fakeClient(result, () => undefined),
        logFailure() {
          logged += 1;
        },
      });
      await assert.rejects(service.generateAnswer('private prompt', context));
      assert.equal(logged, 1);
    }

    let logCount = 0;
    const failed = createAiV2GeminiAnswerService({
      environment: {
        GEMINI_API_KEY: 'test-only-key',
        GEMINI_MODEL: 'gemini-3.5-flash-lite',
      },
      createClient: () =>
        fakeClient(new Error('secret prompt and API key'), () => undefined),
      logFailure() {
        logCount += 1;
      },
    });
    await assert.rejects(failed.generateAnswer('private prompt', context), {
      message: 'AI V2 answer service failed',
    });
    assert.equal(logCount, 1);
  });
});
