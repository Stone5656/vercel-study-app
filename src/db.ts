import 'dotenv/config';

import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      max: 2,
    })
  : null;

export function requirePool(): Pool {
  if (!pool) {
    throw new Error(
      'DATABASE_URL is not set. Configure it in the environment before querying the database.',
    );
  }

  return pool;
}
