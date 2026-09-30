// src/app.ts

import express, { type Request, type Response } from 'express';

import path from 'node:path';

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

export { app };
export default app;
