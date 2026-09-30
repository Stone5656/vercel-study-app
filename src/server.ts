import express, {
  type Request,
  type Response,
} from 'express';

import path from 'node:path';

const app = express();

const port = Number(process.env.PORT ?? 3000);

app.use(
  express.urlencoded({
    extended: true,
  }),
);

app.use(
  express.static(
    path.join(process.cwd(), 'public'),
  ),
);

app.set('view engine', 'ejs');

app.set(
  'views',
  path.join(process.cwd(), 'views'),
);

app.get(
  '/',
  (_req: Request, res: Response): void => {
    res.render('index', {
      title: 'Home',
    });
  },
);

app.listen(port, (): void => {
  console.log(
    `Server started: http://localhost:${port}`,
  );
});
