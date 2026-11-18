import { requirePool } from '../../db.js';

export const AI_HISTORY_LIMIT = 20;

export const AI_HISTORY_SELECT_SQL = `
  SELECT id, prompt, response_text, created_at
  FROM ai_qa_logs
  ORDER BY created_at DESC, id DESC
  LIMIT 20
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
): AiHistoryModel {
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
  };
}

export const aiHistoryModel = createAiHistoryModel();
