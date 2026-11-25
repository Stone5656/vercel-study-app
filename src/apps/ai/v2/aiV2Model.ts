import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { requirePool } from '../../../db.js';

export const AI_V2_CONVERSATION_LIST_SQL = `
  SELECT id, title, created_at, updated_at
  FROM ai_v2_conversations
  ORDER BY updated_at DESC, id DESC
`;

export const AI_V2_CONVERSATION_INSERT_SQL = `
  INSERT INTO ai_v2_conversations (title)
  VALUES ($1)
  RETURNING id, title, created_at, updated_at
`;

export const AI_V2_CONVERSATION_FIND_SQL = `
  SELECT id, title, created_at, updated_at
  FROM ai_v2_conversations
  WHERE id = $1
`;

export const AI_V2_TURNS_SELECT_SQL = `
  SELECT id, conversation_id, prompt, response_text, created_at
  FROM ai_v2_turns
  WHERE conversation_id = $1
  ORDER BY created_at DESC, id DESC
  LIMIT 20
`;

export const AI_V2_CONTEXT_SELECT_SQL = `
  SELECT id, conversation_id, prompt, response_text, created_at
  FROM ai_v2_turns
  WHERE conversation_id = $1
  ORDER BY created_at DESC, id DESC
  LIMIT 5
`;

export const AI_V2_INSERT_TURN_SQL = `
  INSERT INTO ai_v2_turns (conversation_id, prompt, response_text)
  VALUES ($1, $2, $3)
  RETURNING id, conversation_id, prompt, response_text, created_at
`;

export const AI_V2_UPDATE_CONVERSATION_SQL = `
  UPDATE ai_v2_conversations
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = $1
`;

export const AI_V2_LOCK_CONVERSATION_SQL = `
  SELECT id
  FROM ai_v2_conversations
  WHERE id = $1
  FOR UPDATE
`;

export const AI_V2_LATEST_TURN_ID_SQL = `
  SELECT id
  FROM ai_v2_turns
  WHERE conversation_id = $1
  ORDER BY created_at DESC, id DESC
  LIMIT 1
`;

export type AiV2Conversation = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AiV2Turn = {
  id: number;
  conversationId: number;
  prompt: string;
  response: string;
  createdAt: string;
};

export type AiV2Context = {
  turns: AiV2Turn[];
  latestTurnId: number | null;
};

export type AiV2ConversationRow = {
  id: number;
  title: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type AiV2TurnRow = {
  id: number;
  conversation_id: number;
  prompt: string;
  response_text: string;
  created_at: Date | string;
};

export class AiV2DatabaseError extends Error {
  constructor(options?: ErrorOptions) {
    super('AI V2 database operation failed', options);
    this.name = 'AiV2DatabaseError';
  }
}

export class AiV2ConversationNotFoundError extends Error {
  constructor() {
    super('AI V2 conversation not found');
    this.name = 'AiV2ConversationNotFoundError';
  }
}

export class AiV2ContextChangedError extends Error {
  constructor() {
    super('AI V2 conversation changed while generating a response');
    this.name = 'AiV2ContextChangedError';
  }
}

export type AiV2Model = {
  createConversation(title: string): Promise<AiV2Conversation>;
  listConversations(): Promise<AiV2Conversation[]>;
  findConversation(id: number): Promise<AiV2Conversation | null>;
  listTurns(id: number): Promise<AiV2Turn[]>;
  getContext(id: number): Promise<AiV2Context | null>;
  saveTurnIfContextCurrent(
    id: number,
    prompt: string,
    response: string,
    expectedLatestTurnId: number | null,
  ): Promise<AiV2Turn>;
};

type AiV2Pool = Pick<Pool, 'query' | 'connect'>;

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toConversation(row: AiV2ConversationRow): AiV2Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toTurn(row: AiV2TurnRow): AiV2Turn {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    prompt: row.prompt,
    response: row.response_text,
    createdAt: toIsoString(row.created_at),
  };
}

export function createAiV2Model(
  getPool: () => AiV2Pool = requirePool,
): AiV2Model {
  async function queryRows<Row extends QueryResultRow>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<Row[]> {
    try {
      const result = await getPool().query<Row>(sql, [...values]);
      return result.rows;
    } catch (cause) {
      throw new AiV2DatabaseError({ cause });
    }
  }

  return {
    async createConversation(title): Promise<AiV2Conversation> {
      const rows = await queryRows<AiV2ConversationRow>(
        AI_V2_CONVERSATION_INSERT_SQL,
        [title],
      );
      const row = rows[0];
      if (!row) {
        throw new AiV2DatabaseError();
      }
      return toConversation(row);
    },

    async listConversations(): Promise<AiV2Conversation[]> {
      const rows = await queryRows<AiV2ConversationRow>(
        AI_V2_CONVERSATION_LIST_SQL,
      );
      return rows.map(toConversation);
    },

    async findConversation(id): Promise<AiV2Conversation | null> {
      const rows = await queryRows<AiV2ConversationRow>(
        AI_V2_CONVERSATION_FIND_SQL,
        [id],
      );
      const row = rows[0];
      return row ? toConversation(row) : null;
    },

    async listTurns(id): Promise<AiV2Turn[]> {
      const rows = await queryRows<AiV2TurnRow>(AI_V2_TURNS_SELECT_SQL, [id]);
      return rows.slice(0, 20).reverse().map(toTurn);
    },

    async getContext(id): Promise<AiV2Context | null> {
      const conversation = await queryRows<AiV2ConversationRow>(
        AI_V2_CONVERSATION_FIND_SQL,
        [id],
      );
      if (!conversation[0]) {
        return null;
      }
      const rows = await queryRows<AiV2TurnRow>(AI_V2_CONTEXT_SELECT_SQL, [id]);
      return {
        latestTurnId: rows[0]?.id ?? null,
        turns: rows.slice(0, 5).reverse().map(toTurn),
      };
    },

    async saveTurnIfContextCurrent(
      id,
      prompt,
      response,
      expectedLatestTurnId,
    ): Promise<AiV2Turn> {
      let client: PoolClient | undefined;
      let transactionStarted = false;
      try {
        client = await getPool().connect();
        await client.query('BEGIN');
        transactionStarted = true;

        const locked = await client.query<{ id: number }>(
          AI_V2_LOCK_CONVERSATION_SQL,
          [id],
        );
        if (!locked.rows[0]) {
          throw new AiV2ConversationNotFoundError();
        }

        // Separate statement ensures READ COMMITTED sees commits that finished while waiting on FOR UPDATE.
        const latest = await client.query<{ id: number }>(
          AI_V2_LATEST_TURN_ID_SQL,
          [id],
        );
        const latestTurnId = latest.rows[0]?.id ?? null;
        if (latestTurnId !== expectedLatestTurnId) {
          throw new AiV2ContextChangedError();
        }

        const inserted = await client.query<AiV2TurnRow>(
          AI_V2_INSERT_TURN_SQL,
          [id, prompt, response],
        );
        const row = inserted.rows[0];
        if (!row) {
          throw new AiV2DatabaseError();
        }
        await client.query(AI_V2_UPDATE_CONVERSATION_SQL, [id]);
        await client.query('COMMIT');
        transactionStarted = false;
        return toTurn(row);
      } catch (cause) {
        if (client && transactionStarted) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // Preserve the original safe error classification.
          }
        }
        if (
          cause instanceof AiV2DatabaseError ||
          cause instanceof AiV2ConversationNotFoundError ||
          cause instanceof AiV2ContextChangedError
        ) {
          throw cause;
        }
        throw new AiV2DatabaseError({ cause });
      } finally {
        client?.release();
      }
    },
  };
}

export const aiV2Model = createAiV2Model();
