import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createAiV2Router } from '../../src/apps/ai/v2/aiV2Router.js';
import {
  type AiV2Model,
  type AiV2Conversation,
} from '../../src/apps/ai/v2/aiV2Model.js';
import type { AiV2AnswerService } from '../../src/apps/ai/v2/aiV2Service.js';
import { createAiV2DemoGuard } from '../../src/apps/ai/v2/aiV2Middleware.js';

const conversation: AiV2Conversation = {
  id: 1,
  title: 'Topic',
  createdAt: '2026-11-25T00:00:00.000Z',
  updatedAt: '2026-11-25T00:00:00.000Z',
};

describe('AI V2 integration and static safety', () => {
  it('stops every V2 API in production before database or AI work', async () => {
    let modelCalls = 0;
    let serviceCalls = 0;
    const model: AiV2Model = {
      async createConversation() {
        modelCalls += 1;
        return conversation;
      },
      async listConversations() {
        modelCalls += 1;
        return [conversation];
      },
      async findConversation() {
        modelCalls += 1;
        return conversation;
      },
      async listTurns() {
        modelCalls += 1;
        return [];
      },
      async getContext() {
        modelCalls += 1;
        return { turns: [], latestTurnId: null };
      },
      async saveTurnIfContextCurrent() {
        modelCalls += 1;
        throw new Error('must not be reached');
      },
    };
    const answerService: AiV2AnswerService = {
      async generateAnswer() {
        serviceCalls += 1;
        return 'answer';
      },
    };
    const app = express();
    app.use(
      createAiV2Router(
        createAiV2DemoGuard({
          NODE_ENV: 'production',
          AI_V2_DEMO_ENABLED: 'true',
          VERCEL_ENV: 'production',
        }),
        model,
        answerService,
      ),
    );

    const responses = await Promise.all([
      request(app).get('/api/ai/v2/conversations'),
      request(app).post('/api/ai/v2/conversations').send({ title: 'topic' }),
      request(app).get('/api/ai/v2/conversations/1/turns'),
      request(app)
        .post('/api/ai/v2/conversations/1/turns')
        .send({ prompt: 'question' }),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 503);
      assert.equal(response.body.error.code, 'DEMO_DISABLED');
    }
    assert.equal(modelCalls, 0);
    assert.equal(serviceCalls, 0);
  });

  it('does not ship Gemini or database secrets or unsafe HTML rendering to browsers', async () => {
    const browserScript = await readFile(
      new URL('../../public/ai/v2/app.js', import.meta.url),
      'utf8',
    );
    const browserHtml = await readFile(
      new URL('../../public/ai/v2/index.html', import.meta.url),
      'utf8',
    );

    assert.doesNotMatch(
      browserScript,
      /@google\/genai|GEMINI_API_KEY|DATABASE_URL/,
    );
    assert.doesNotMatch(browserHtml, /GEMINI_API_KEY|DATABASE_URL/);
    assert.doesNotMatch(browserScript, /\.innerHTML\b/);
    assert.match(browserScript, /\.textContent\s*=/);
  });
});
