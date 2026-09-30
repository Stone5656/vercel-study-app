import { app } from './app.js';

const port = Number(process.env.PORT ?? 3000);

app.listen(port, (): void => {
  console.log(`Server started: http://localhost:${port}`);
});
