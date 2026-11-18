import { requirePool } from '../../db.js';

export const AI_HISTORY_LIMIT = 20;

export const AI_HISTORY_SELECT_SQL = `
  SELECT id, prompt, response_text, created_at
  FROM ai_qa_logs
  ORDER BY created_at DESC, id DESC
  LIMIT 20
`;

export const AI_QUESTION_INSERT_SQL = `
  INSERT INTO ai_qa_logs (prompt, response_text)
  VALUES ($1, $2)
  RETURNING id, prompt, response_text, created_at
`;

export type AiHistoryItem = {
  id: number;
  prompt: string;
  response: string;
  createdAt: string;
};

export type AiHistoryModel = {
  listHistory(): Promise<AiHistoryItem[]>;
};

export type AiModel = AiHistoryModel & {
  saveQuestionAnswer(prompt: string, response: string): Promise<AiHistoryItem>;
};

export type AiHistoryRow = {
  id: number;
  prompt: string;
  response_text: string;
  created_at: Date | string;
};

export type AiHistoryRowsReader = () => Promise<readonly AiHistoryRow[]>;

export class AiDatabaseError extends Error {
  constructor(options?: ErrorOptions) {
    super('AI history database operation failed', options);
    this.name = 'AiDatabaseError';
  }
}

async function readAiHistoryRows(): Promise<AiHistoryRow[]> {
  try {
    const result = await requirePool().query<AiHistoryRow>(
      AI_HISTORY_SELECT_SQL,
    );
    return result.rows;
  } catch (cause) {
    throw new AiDatabaseError({ cause });
  }
}

async function insertAiQuestionAnswer(
  prompt: string,
  response: string,
): Promise<AiHistoryRow> {
  try {
    const result = await requirePool().query<AiHistoryRow>(
      AI_QUESTION_INSERT_SQL,
      [prompt, response],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('INSERT did not return a row');
    }
    return row;
  } catch (cause) {
    throw new AiDatabaseError({ cause });
  }
}

function toAiHistoryItem(row: AiHistoryRow): AiHistoryItem {
  const createdAt =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString();

  return {
    id: row.id,
    prompt: row.prompt,
    response: row.response_text,
    createdAt,
  };
}

export function createAiHistoryModel(
  readRows: AiHistoryRowsReader = readAiHistoryRows,
  insertRow: (
    prompt: string,
    response: string,
  ) => Promise<AiHistoryRow> = insertAiQuestionAnswer,
): AiModel {
  return {
    async listHistory(): Promise<AiHistoryItem[]> {
      let rows: readonly AiHistoryRow[];

      try {
        rows = await readRows();
      } catch (cause) {
        if (cause instanceof AiDatabaseError) {
          throw cause;
        }
        throw new AiDatabaseError({ cause });
      }

      return rows.slice(0, AI_HISTORY_LIMIT).map(toAiHistoryItem);
    },
    async saveQuestionAnswer(
      prompt: string,
      response: string,
    ): Promise<AiHistoryItem> {
      let row: AiHistoryRow;
      try {
        row = await insertRow(prompt, response);
      } catch (cause) {
        if (cause instanceof AiDatabaseError) {
          throw cause;
        }
        throw new AiDatabaseError({ cause });
      }
      return toAiHistoryItem(row);
    },
  };
}

export const aiModel = createAiHistoryModel();
export const aiHistoryModel: AiHistoryModel = aiModel;
