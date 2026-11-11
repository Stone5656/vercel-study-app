// src/app.ts

import express, { type Request, type Response } from 'express';

import path from 'node:path';
import { pool } from './db.js';

const app = express();

app.use(
  express.urlencoded({
    extended: true,
  }),
);

app.use(express.static(path.join(process.cwd(), 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

app.get('/', (_req: Request, res: Response): void => {
  res.render('index', {
    title: 'Home',
  });
});

app.get(
  '/api/db-check',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await pool.query('SELECT 1 AS connection_test');
      res.status(200).json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', database: 'unavailable' });
    }
  },
);

export { app };
export default app;
