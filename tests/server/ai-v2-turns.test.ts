import assert from 'node:assert/strict';
import express from 'express';
import { describe, it } from 'node:test';

import request from 'supertest';

import {
  AiV2ConversationNotFoundError,
  AiV2DatabaseError,
  type AiV2Model,
  type AiV2Turn,
} from '../../src/apps/ai/v2/aiV2Model.js';
import { createAiV2DemoGuard } from '../../src/apps/ai/v2/aiV2Middleware.js';
import { createAiV2Router } from '../../src/apps/ai/v2/aiV2Router.js';

const turn: AiV2Turn = {
  id: 10,
  conversationId: 4,
  prompt: 'Question',
  response: 'Answer',
  createdAt: '2026-11-25T00:00:00.000Z',
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
        createdAt: turn.createdAt,
        updatedAt: turn.createdAt,
      };
    },
    async listTurns() {
      return [turn];
    },
    async getContext() {
      return { turns: [], latestTurnId: null };
    },
    async saveTurnIfContextCurrent() {
      return turn;
    },
    ...overrides,
  };
}

function createApp(model: AiV2Model) {
  const app = express();
  app.use(
    createAiV2Router(
      createAiV2DemoGuard({
        NODE_ENV: 'development',
        AI_V2_DEMO_ENABLED: 'true',
      }),
      model,
    ),
  );
  return app;
}

describe('GET /api/ai/v2/conversations/:conversationId/turns', () => {
  it('returns the selected conversation turns in the model-provided order', async () => {
    let queriedId = 0;
    const app = createApp(
      createModel({
        async findConversation(id) {
          queriedId = id;
          return {
            id,
            title: 'Topic',
            createdAt: turn.createdAt,
            updatedAt: turn.createdAt,
          };
        },
      }),
    );

    const response = await request(app).get('/api/ai/v2/conversations/4/turns');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { success: true, items: [turn] });
    assert.equal(queriedId, 4);
  });

  it('accepts canonical positive INTEGER boundaries', async () => {
    const ids: number[] = [];
    const app = createApp(
      createModel({
        async findConversation(id) {
          ids.push(id);
          return {
            id,
            title: 'Topic',
            createdAt: turn.createdAt,
            updatedAt: turn.createdAt,
          };
        },
      }),
    );

    const minimum = await request(app).get('/api/ai/v2/conversations/1/turns');
    const maximum = await request(app).get(
      '/api/ai/v2/conversations/2147483647/turns',
    );

    assert.equal(minimum.status, 200);
    assert.equal(maximum.status, 200);
    assert.deepEqual(ids, [1, 2_147_483_647]);
  });

  it('rejects noncanonical or out-of-range IDs before DB access', async () => {
    let calls = 0;
    const app = createApp(
      createModel({
        async findConversation() {
          calls += 1;
          return null;
        },
      }),
    );
    const invalidIds = [
      '0',
      '01',
      '+1',
      '-1',
      '1e2',
      '2147483648',
      '999999999999999999999999999999',
    ];

    for (const id of invalidIds) {
      const response = await request(app).get(
        `/api/ai/v2/conversations/${id}/turns`,
      );
      assert.equal(response.status, 400, id);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal(calls, 0);
  });

  it('distinguishes an empty history from a missing conversation', async () => {
    const emptyApp = createApp(
      createModel({
        async listTurns() {
          return [];
        },
      }),
    );
    const missingApp = createApp(
      createModel({
        async findConversation() {
          return null;
        },
      }),
    );

    const empty = await request(emptyApp).get(
      '/api/ai/v2/conversations/4/turns',
    );
    const missing = await request(missingApp).get(
      '/api/ai/v2/conversations/4/turns',
    );

    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, { success: true, items: [] });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'CONVERSATION_NOT_FOUND');
  });

  it('maps database and unexpected errors to safe responses', async () => {
    const dbApp = createApp(
      createModel({
        async findConversation() {
          throw new AiV2DatabaseError({
            cause: new Error('private database url'),
          });
        },
      }),
    );
    const internalApp = createApp(
      createModel({
        async findConversation() {
          throw new Error('private internal detail');
        },
      }),
    );

    const dbFailure = await request(dbApp).get(
      '/api/ai/v2/conversations/4/turns',
    );
    const internalFailure = await request(internalApp).get(
      '/api/ai/v2/conversations/4/turns',
    );

    assert.equal(dbFailure.status, 503);
    assert.equal(dbFailure.body.error.code, 'DB_UNAVAILABLE');
    assert.equal(JSON.stringify(dbFailure.body).includes('private'), false);
    assert.equal(internalFailure.status, 500);
    assert.equal(internalFailure.body.error.code, 'INTERNAL_ERROR');
  });

  it('maps the model not-found signal to the fixed 404 response', async () => {
    const app = createApp(
      createModel({
        async findConversation() {
          throw new AiV2ConversationNotFoundError();
        },
      }),
    );
    const response = await request(app).get('/api/ai/v2/conversations/4/turns');

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'CONVERSATION_NOT_FOUND');
  });
});
