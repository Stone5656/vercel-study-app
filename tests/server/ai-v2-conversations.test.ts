import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createAiV2Router } from '../../src/apps/ai/v2/aiV2Router.js';
import {
  AiV2DatabaseError,
  type AiV2Conversation,
  type AiV2Model,
} from '../../src/apps/ai/v2/aiV2Model.js';
import { createAiV2DemoGuard } from '../../src/apps/ai/v2/aiV2Middleware.js';

const conversation: AiV2Conversation = {
  id: 2,
  title: 'Topic',
  createdAt: '2026-11-25T00:00:00.000Z',
  updatedAt: '2026-11-25T00:00:00.000Z',
};

function createModel(overrides: Partial<AiV2Model> = {}): AiV2Model {
  return {
    async createConversation() {
      return conversation;
    },
    async listConversations() {
      return [conversation];
    },
    async findConversation() {
      return conversation;
    },
    async listTurns() {
      return [];
    },
    async getContext() {
      return { turns: [], latestTurnId: null };
    },
    async saveTurnIfContextCurrent() {
      throw new Error('not used by this router');
    },
    ...overrides,
  };
}

function createApp(
  model: AiV2Model,
  environment: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    AI_V2_DEMO_ENABLED: 'true',
  },
  guard?: RequestHandler,
) {
  const app = express();
  app.use(createAiV2Router(guard ?? createAiV2DemoGuard(environment), model));
  app.use(express.json());
  return app;
}

describe('AI V2 conversation endpoints', () => {
  it('creates a conversation and returns the saved DTO', async () => {
    let savedTitle = '';
    const app = createApp(
      createModel({
        async createConversation(title) {
          savedTitle = title;
          return conversation;
        },
      }),
    );

    const response = await request(app)
      .post('/api/ai/v2/conversations')
      .send({ title: '  Topic  ' });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body, { success: true, item: conversation });
    assert.equal(savedTitle, 'Topic');
  });

  it('accepts title lengths of 1 and 50 Unicode code points', async () => {
    const titles: string[] = [];
    const app = createApp(
      createModel({
        async createConversation(title) {
          titles.push(title);
          return conversation;
        },
      }),
    );

    const one = await request(app)
      .post('/api/ai/v2/conversations')
      .send({ title: '日' });
    const fifty = await request(app)
      .post('/api/ai/v2/conversations')
      .send({ title: '😀'.repeat(50) });

    assert.equal(one.status, 201);
    assert.equal(fifty.status, 201);
    assert.equal(Array.from(titles[1] ?? '').length, 50);
  });

  it('rejects invalid titles without calling the model', async () => {
    let modelCalls = 0;
    const app = createApp(
      createModel({
        async createConversation() {
          modelCalls += 1;
          return conversation;
        },
      }),
    );
    const inputs: unknown[] = [
      {},
      { title: '' },
      { title: '  ' },
      { title: 'a'.repeat(51) },
      { title: 42 },
      null,
    ];

    for (const body of inputs) {
      const response = await request(app)
        .post('/api/ai/v2/conversations')
        .type('json')
        .send(body as object);
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal(modelCalls, 0);
  });

  it('maps malformed JSON, oversized bodies, and non-JSON media types', async () => {
    const app = createApp(createModel());
    const malformed = await request(app)
      .post('/api/ai/v2/conversations')
      .set('Content-Type', 'application/json')
      .send('{');
    const oversized = await request(app)
      .post('/api/ai/v2/conversations')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ title: 'x'.repeat(16_400) }));
    const nonJson = await request(app)
      .post('/api/ai/v2/conversations')
      .type('text')
      .send('title=topic');

    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, 'INVALID_JSON');
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.error.code, 'PAYLOAD_TOO_LARGE');
    assert.equal(nonJson.status, 415);
    assert.equal(nonJson.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('uses only the explicitly enabled local development environment', async () => {
    const cases: Array<{
      label: string;
      environment: NodeJS.ProcessEnv;
      enabled: boolean;
    }> = [
      {
        label: 'enabled local development',
        environment: { NODE_ENV: 'development', AI_V2_DEMO_ENABLED: 'true' },
        enabled: true,
      },
      {
        label: 'flag disabled',
        environment: { NODE_ENV: 'development', AI_V2_DEMO_ENABLED: 'false' },
        enabled: false,
      },
      {
        label: 'NODE_ENV missing',
        environment: { AI_V2_DEMO_ENABLED: 'true' },
        enabled: false,
      },
      {
        label: 'test environment',
        environment: { NODE_ENV: 'test', AI_V2_DEMO_ENABLED: 'true' },
        enabled: false,
      },
      {
        label: 'production',
        environment: { NODE_ENV: 'production', AI_V2_DEMO_ENABLED: 'true' },
        enabled: false,
      },
      {
        label: 'Vercel preview',
        environment: {
          NODE_ENV: 'development',
          AI_V2_DEMO_ENABLED: 'true',
          VERCEL_ENV: 'preview',
        },
        enabled: false,
      },
      {
        label: 'Vercel production',
        environment: {
          NODE_ENV: 'development',
          AI_V2_DEMO_ENABLED: 'true',
          VERCEL_ENV: 'production',
        },
        enabled: false,
      },
    ];

    for (const testCase of cases) {
      let calls = 0;
      const app = createApp(
        createModel({
          async listConversations() {
            calls += 1;
            return [];
          },
        }),
        testCase.environment,
      );
      const response = await request(app).get('/api/ai/v2/conversations');
      assert.equal(
        response.status,
        testCase.enabled ? 200 : 503,
        testCase.label,
      );
      assert.equal(calls, testCase.enabled ? 1 : 0, testCase.label);
      if (!testCase.enabled) {
        assert.equal(response.body.error.code, 'DEMO_DISABLED');
      }
    }
  });

  it('checks the demo guard before Content-Type and JSON parsing', async () => {
    const app = createApp(createModel(), { NODE_ENV: 'production' });
    const response = await request(app)
      .post('/api/ai/v2/conversations')
      .type('text')
      .send('{');

    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'DEMO_DISABLED');
  });

  it('returns a fixed database error for model failures', async () => {
    const app = createApp(
      createModel({
        async listConversations() {
          throw new AiV2DatabaseError({
            cause: new Error('private connection information'),
          });
        },
      }),
    );
    const response = await request(app).get('/api/ai/v2/conversations');

    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'DB_UNAVAILABLE');
    assert.equal(JSON.stringify(response.body).includes('private'), false);
  });

  it('returns empty conversation lists as a successful response', async () => {
    const app = createApp(
      createModel({
        async listConversations() {
          return [];
        },
      }),
    );
    const response = await request(app).get('/api/ai/v2/conversations');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { success: true, items: [] });
  });
});
