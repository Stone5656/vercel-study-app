import 'dotenv/config';

import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Configure it in the environment before starting the application.',
  );
}

export const pool = new Pool({
  connectionString,
  max: 2,
});
