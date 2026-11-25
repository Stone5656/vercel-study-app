import assert from 'node:assert/strict';
import express from 'express';
import { describe, it } from 'node:test';

import request from 'supertest';

import {
  AiV2ContextChangedError,
  AiV2DatabaseError,
  type AiV2Context,
  type AiV2Model,
  type AiV2Turn,
} from '../../src/apps/ai/v2/aiV2Model.js';
import { createAiV2DemoGuard } from '../../src/apps/ai/v2/aiV2Middleware.js';
import { createAiV2Router } from '../../src/apps/ai/v2/aiV2Router.js';
import type { AiV2AnswerService } from '../../src/apps/ai/v2/aiV2Service.js';

const savedTurn: AiV2Turn = {
  id: 11,
  conversationId: 4,
  prompt: 'Current question',
  response: 'Generated answer',
  createdAt: '2026-11-25T00:00:00.000Z',
};

const context: AiV2Context = {
  turns: [
    {
      id: 10,
      conversationId: 4,
      prompt: 'Earlier question',
      response: 'Earlier answer',
      createdAt: '2026-11-24T00:00:00.000Z',
    },
  ],
  latestTurnId: 10,
};

function createModel(overrides: Partial<AiV2Model> = {}): AiV2Model {
  return {
    async createConversation() {
      throw new Error('not used');
    },
    async listConversations() {
      return [];
    },
    async findConversation() {
      return {
        id: 4,
        title: 'Topic',
        createdAt: savedTurn.createdAt,
        updatedAt: savedTurn.createdAt,
      };
    },
    async listTurns() {
      return [];
    },
    async getContext() {
      return context;
    },
    async saveTurnIfContextCurrent() {
      return savedTurn;
    },
    ...overrides,
  };
}

const enabledGuard = createAiV2DemoGuard({
  NODE_ENV: 'development',
  AI_V2_DEMO_ENABLED: 'true',
});

function createApp(model: AiV2Model, service: AiV2AnswerService) {
  const app = express();
  app.use(createAiV2Router(enabledGuard, model, service));
  return app;
}

describe('POST /api/ai/v2/conversations/:conversationId/turns', () => {
  it('generates with the selected context and saves before returning 201', async () => {
    const calls: string[] = [];
    let savedPrompt = '';
    const model = createModel({
      async getContext(id) {
        calls.push(`context:${id}`);
        return context;
      },
      async saveTurnIfContextCurrent(id, prompt, response, version) {
        calls.push(`save:${id}`);
        savedPrompt = prompt;
        assert.equal(response, 'Generated answer');
        assert.equal(version, 10);
        return savedTurn;
      },
    });
    const service: AiV2AnswerService = {
      async generateAnswer(prompt, receivedContext) {
        calls.push('generate');
        assert.equal(prompt, 'Current question');
        assert.equal(receivedContext, context);
        return 'Generated answer';
      },
    };

    const response = await request(createApp(model, service))
      .post('/api/ai/v2/conversations/4/turns')
      .send({ prompt: '  Current question  ' });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body, { success: true, item: savedTurn });
    assert.deepEqual(calls, ['context:4', 'generate', 'save:4']);
    assert.equal(savedPrompt, 'Current question');
  });

  it('rejects prompt boundaries before model or AI work', async () => {
    let calls = 0;
    const model = createModel({
      async getContext() {
        calls += 1;
        return context;
      },
    });
    const service: AiV2AnswerService = {
      async generateAnswer() {
        calls += 1;
        return 'answer';
      },
    };
    const app = createApp(model, service);

    for (const prompt of ['   ', '😀'.repeat(2001)]) {
      const response = await request(app)
        .post('/api/ai/v2/conversations/4/turns')
        .send({ prompt });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    }
    const validBoundary = await request(app)
      .post('/api/ai/v2/conversations/4/turns')
      .send({ prompt: '😀'.repeat(2000) });

    assert.equal(validBoundary.status, 201);
    assert.equal(calls, 2);
  });

  it('returns 502 without saving on AI failure or empty response', async () => {
    let saveCalls = 0;
    const model = createModel({
      async saveTurnIfContextCurrent() {
        saveCalls += 1;
        return savedTurn;
      },
    });
    const services: AiV2AnswerService[] = [
      {
        async generateAnswer() {
          throw new Error('private Gemini response');
        },
      },
      {
        async generateAnswer() {
          return '   ';
        },
      },
    ];

    for (const service of services) {
      const response = await request(createApp(model, service))
        .post('/api/ai/v2/conversations/4/turns')
        .send({ prompt: 'question' });
      assert.equal(response.status, 502);
      assert.equal(response.body.error.code, 'AI_UNAVAILABLE');
      assert.equal(JSON.stringify(response.body).includes('private'), false);
    }
    assert.equal(saveCalls, 0);
  });

  it('returns safe DB and context-conflict errors without 201', async () => {
    const service: AiV2AnswerService = {
      async generateAnswer() {
        return 'answer';
      },
    };
    const dbFailure = await request(
      createApp(
        createModel({
          async saveTurnIfContextCurrent() {
            throw new AiV2DatabaseError({
              cause: new Error('private database connection'),
            });
          },
        }),
        service,
      ),
    )
      .post('/api/ai/v2/conversations/4/turns')
      .send({ prompt: 'question' });
    const contextConflict = await request(
      createApp(
        createModel({
          async saveTurnIfContextCurrent() {
            throw new AiV2ContextChangedError();
          },
        }),
        service,
      ),
    )
      .post('/api/ai/v2/conversations/4/turns')
      .send({ prompt: 'question' });

    assert.equal(dbFailure.status, 503);
    assert.equal(dbFailure.body.error.code, 'DB_UNAVAILABLE');
    assert.equal(JSON.stringify(dbFailure.body).includes('private'), false);
    assert.equal(contextConflict.status, 409);
    assert.equal(contextConflict.body.error.code, 'CONVERSATION_CHANGED');
  });

  it('does not respond until the database save promise completes', async () => {
    let releaseSave = (): void => undefined;
    let signalSaveStarted = (): void => undefined;
    const saveStarted = new Promise<void>((resolve) => {
      signalSaveStarted = resolve;
    });
    let responseFinished = false;
    const model = createModel({
      async saveTurnIfContextCurrent() {
        signalSaveStarted();
        await new Promise<void>((resolve) => {
          releaseSave = resolve;
        });
        return savedTurn;
      },
    });
    const responsePromise = request(
      createApp(model, {
        async generateAnswer() {
          return 'answer';
        },
      }),
    )
      .post('/api/ai/v2/conversations/4/turns')
      .send({ prompt: 'question' })
      .then((response) => {
        responseFinished = true;
        return response;
      });

    await saveStarted;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(responseFinished, false);
    releaseSave();
    assert.equal((await responsePromise).status, 201);
  });

  it('does not call Gemini when the conversation is missing', async () => {
    let serviceCalls = 0;
    const response = await request(
      createApp(
        createModel({
          async getContext() {
            return null;
          },
        }),
        {
          async generateAnswer() {
            serviceCalls += 1;
            return 'answer';
          },
        },
      ),
    )
      .post('/api/ai/v2/conversations/4/turns')
      .send({ prompt: 'question' });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'CONVERSATION_NOT_FOUND');
    assert.equal(serviceCalls, 0);
  });
});
