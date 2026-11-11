import { requirePool } from '../../db.js';

export type Todo = {
  id: number;
  title: string;
  isCompleted: boolean;
  createdAt: string;
};

type TodoRow = {
  id: number;
  title: string;
  is_completed: boolean;
  created_at: Date | string;
};

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    isCompleted: row.is_completed,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listTodos(): Promise<Todo[]> {
  const result = await requirePool().query<TodoRow>(
    `SELECT id, title, is_completed, created_at
     FROM todo_tasks
     ORDER BY id;`,
  );

  return result.rows.map(toTodo);
}

export async function createTodo(title: string): Promise<Todo> {
  const result = await requirePool().query<TodoRow>(
    `INSERT INTO todo_tasks (title)
     VALUES ($1)
     RETURNING id, title, is_completed, created_at;`,
    [title],
  );

  const todo = result.rows[0];
  if (!todo) {
    throw new Error('TODO insert did not return a row.');
  }

  return toTodo(todo);
}
