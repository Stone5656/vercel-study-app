import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Pool } from 'pg';

import {
  AI_V2_CONTEXT_SELECT_SQL,
  AI_V2_CONVERSATION_INSERT_SQL,
  AI_V2_CONVERSATION_LIST_SQL,
  AI_V2_INSERT_TURN_SQL,
  AI_V2_LATEST_TURN_ID_SQL,
  AI_V2_LOCK_CONVERSATION_SQL,
  AI_V2_TURNS_SELECT_SQL,
  AI_V2_UPDATE_CONVERSATION_SQL,
  AiV2ContextChangedError,
  AiV2DatabaseError,
  createAiV2Model,
  type AiV2ConversationRow,
  type AiV2TurnRow,
} from '../../src/apps/ai/v2/aiV2Model.js';

type QueryCall = {
  sql: string;
  values: readonly unknown[];
};

function asPool(value: object): Pick<Pool, 'query' | 'connect'> {
  return value as Pick<Pool, 'query' | 'connect'>;
}

function conversationRow(
  id: number,
  title = 'Design notes',
): AiV2ConversationRow {
  return {
    id,
    title,
    created_at: new Date('2026-11-25T00:00:00.000Z'),
    updated_at: new Date('2026-11-25T00:01:00.000Z'),
  };
}

function turnRow(id: number, conversationId = 7): AiV2TurnRow {
  return {
    id,
    conversation_id: conversationId,
    prompt: `prompt-${id}`,
    response_text: `response-${id}`,
    created_at: new Date(
      `2026-11-25T00:${String(id).padStart(2, '0')}:00.000Z`,
    ),
  };
}

describe('AI V2 model', () => {
  it('creates and lists conversations using fixed parameterized SQL', async () => {
    const calls: QueryCall[] = [];
    const inserted = conversationRow(7, 'My topic');
    const listed = [conversationRow(8), conversationRow(7)];
    const model = createAiV2Model(() =>
      asPool({
        query: async (sql: string, values: readonly unknown[] = []) => {
          calls.push({ sql, values });
          return {
            rows: sql === AI_V2_CONVERSATION_INSERT_SQL ? [inserted] : listed,
          };
        },
        connect: async () => {
          throw new Error('connect should not be called');
        },
      }),
    );

    const created = await model.createConversation('My topic');
    const conversations = await model.listConversations();

    assert.equal(created.id, 7);
    assert.equal(created.title, 'My topic');
    assert.equal(created.createdAt, '2026-11-25T00:00:00.000Z');
    assert.deepEqual(
      conversations.map(({ id }) => id),
      [8, 7],
    );
    assert.equal(calls[0]?.sql, AI_V2_CONVERSATION_INSERT_SQL);
    assert.deepEqual(calls[0]?.values, ['My topic']);
    assert.match(
      AI_V2_CONVERSATION_LIST_SQL,
      /ORDER BY updated_at DESC, id DESC/,
    );
  });

  it('returns only the newest 20 turns in chronological order', async () => {
    const requested: QueryCall[] = [];
    const rows = Array.from({ length: 22 }, (_, index) => turnRow(22 - index));
    const model = createAiV2Model(() =>
      asPool({
        query: async (sql: string, values: readonly unknown[] = []) => {
          requested.push({ sql, values });
          return { rows };
        },
        connect: async () => {
          throw new Error('connect should not be called');
        },
      }),
    );

    const turns = await model.listTurns(7);

    assert.equal(turns.length, 20);
    assert.equal(turns[0]?.id, 3);
    assert.equal(turns[19]?.id, 22);
    assert.deepEqual(requested[0]?.values, [7]);
    assert.match(
      AI_V2_TURNS_SELECT_SQL,
      /ORDER BY created_at DESC, id DESC\s+LIMIT 20/,
    );
  });

  it('builds a five-turn chronological context and records its version', async () => {
    const model = createAiV2Model(() =>
      asPool({
        query: async (sql: string) => ({
          rows:
            sql === AI_V2_CONVERSATION_LIST_SQL ||
            sql === AI_V2_CONVERSATION_INSERT_SQL
              ? []
              : sql === AI_V2_CONTEXT_SELECT_SQL
                ? Array.from({ length: 6 }, (_, index) => turnRow(6 - index))
                : [conversationRow(7)],
        }),
        connect: async () => {
          throw new Error('connect should not be called');
        },
      }),
    );

    const context = await model.getContext(7);

    assert.ok(context);
    assert.equal(context.latestTurnId, 6);
    assert.deepEqual(
      context.turns.map(({ id }) => id),
      [2, 3, 4, 5, 6],
    );
    assert.match(AI_V2_CONTEXT_SELECT_SQL, /LIMIT 5/);
  });

  it('commits the turn and updates the conversation in one transaction', async () => {
    const calls: QueryCall[] = [];
    const client = {
      query: async (sql: string, values: readonly unknown[] = []) => {
        calls.push({ sql, values });
        if (sql === AI_V2_LOCK_CONVERSATION_SQL) return { rows: [{ id: 7 }] };
        if (sql === AI_V2_LATEST_TURN_ID_SQL) return { rows: [{ id: 6 }] };
        if (sql === AI_V2_INSERT_TURN_SQL) return { rows: [turnRow(8)] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const model = createAiV2Model(() =>
      asPool({
        query: async () => ({ rows: [] }),
        connect: async () => client,
      }),
    );

    const turn = await model.saveTurnIfContextCurrent(7, 'next', 'answer', 6);

    assert.equal(turn.id, 8);
    assert.deepEqual(
      calls.map(({ sql }) => sql),
      [
        'BEGIN',
        AI_V2_LOCK_CONVERSATION_SQL,
        AI_V2_LATEST_TURN_ID_SQL,
        AI_V2_INSERT_TURN_SQL,
        AI_V2_UPDATE_CONVERSATION_SQL,
        'COMMIT',
      ],
    );
    assert.deepEqual(calls[3]?.values, [7, 'next', 'answer']);
  });

  it('rolls back when the context has changed and does not insert a turn', async () => {
    const calls: string[] = [];
    const model = createAiV2Model(() =>
      asPool({
        query: async () => ({ rows: [] }),
        connect: async () => ({
          query: async (sql: string) => {
            calls.push(sql);
            if (sql === AI_V2_LOCK_CONVERSATION_SQL)
              return { rows: [{ id: 7 }] };
            if (sql === AI_V2_LATEST_TURN_ID_SQL) return { rows: [{ id: 9 }] };
            return { rows: [] };
          },
          release: () => undefined,
        }),
      }),
    );

    await assert.rejects(
      model.saveTurnIfContextCurrent(7, 'next', 'answer', 6),
      AiV2ContextChangedError,
    );
    assert.deepEqual(calls, [
      'BEGIN',
      AI_V2_LOCK_CONVERSATION_SQL,
      AI_V2_LATEST_TURN_ID_SQL,
      'ROLLBACK',
    ]);
  });

  it('rolls back database failures before returning a turn', async () => {
    const calls: string[] = [];
    const model = createAiV2Model(() =>
      asPool({
        query: async () => ({ rows: [] }),
        connect: async () => ({
          query: async (sql: string) => {
            calls.push(sql);
            if (sql === AI_V2_LOCK_CONVERSATION_SQL)
              return { rows: [{ id: 7 }] };
            if (sql === AI_V2_LATEST_TURN_ID_SQL) return { rows: [] };
            if (sql === AI_V2_INSERT_TURN_SQL) {
              throw new Error('private database detail');
            }
            return { rows: [] };
          },
          release: () => undefined,
        }),
      }),
    );

    await assert.rejects(
      model.saveTurnIfContextCurrent(7, 'next', 'answer', null),
      AiV2DatabaseError,
    );
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.equal(calls.includes('COMMIT'), false);
  });

  it('maps database failures to a safe model error', async () => {
    const model = createAiV2Model(() =>
      asPool({
        query: async () => {
          throw new Error('private database detail');
        },
        connect: async () => {
          throw new Error('private database detail');
        },
      }),
    );

    await assert.rejects(model.listConversations(), (error: unknown) => {
      assert.ok(error instanceof AiV2DatabaseError);
      assert.equal(error.message, 'AI V2 database operation failed');
      return true;
    });
  });
});
