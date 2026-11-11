// src/app.ts

import express, { type Request, type Response } from 'express';

import path from 'node:path';
import { requirePool } from './db.js';
import {
  createTodoRouter,
  todoJsonErrorHandler,
} from './apps/todo/todoRouter.js';

type Product = {
  id: number;
  name: string;
  price: number;
};

const app = express();

app.use(
  express.urlencoded({
    extended: true,
  }),
);
app.use(express.json());

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
      await requirePool().query('SELECT 1 AS connection_test');
      res.status(200).json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', database: 'unavailable' });
    }
  },
);

app.get('/db-sample', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await requirePool().query<Product>(
      'SELECT id, name, price FROM products ORDER BY id;',
    );
    res.render('db-sample', {
      title: '商品一覧',
      products: result.rows,
    });
  } catch {
    res.status(503).send('データベースを利用できません。');
  }
});

app.use(createTodoRouter());
app.use(todoJsonErrorHandler);

export { app };
export default app;
