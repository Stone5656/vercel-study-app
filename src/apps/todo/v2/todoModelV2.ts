import { requirePool } from '../../../db.js';

export type TodoPriority = 'low' | 'normal' | 'high';

export type TodoV2 = {
  id: number;
  title: string;
  isCompleted: boolean;
  priority: TodoPriority;
  createdAt: string;
};

export type TodoV2Changes = {
  isCompleted?: boolean;
  priority?: TodoPriority;
};

export type TodoFiltersV2 = {
  completed?: boolean;
  priority?: TodoPriority;
};

export type TodoModelV2 = {
  listTodosV2(filters: TodoFiltersV2): Promise<TodoV2[]>;
  createTodoV2(title: string, priority: TodoPriority): Promise<TodoV2>;
  updateTodoV2(id: number, changes: TodoV2Changes): Promise<TodoV2 | null>;
  deleteTodoV2(id: number): Promise<boolean>;
};

type TodoRowV2 = {
  id: number;
  title: string;
  is_completed: boolean;
  priority: TodoPriority;
  created_at: Date | string;
};

function toTodoV2(row: TodoRowV2): TodoV2 {
  return {
    id: row.id,
    title: row.title,
    isCompleted: row.is_completed,
    priority: row.priority,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function buildTodoListQueryV2(filters: TodoFiltersV2): {
  text: string;
  values: (boolean | TodoPriority)[];
} {
  const conditions: string[] = [];
  const values: (boolean | TodoPriority)[] = [];

  if (filters.completed !== undefined) {
    values.push(filters.completed);
    conditions.push(`is_completed = $${values.length}`);
  }
  if (filters.priority !== undefined) {
    values.push(filters.priority);
    conditions.push(`priority = $${values.length}`);
  }

  return {
    text: `SELECT id, title, is_completed, priority, created_at
     FROM v2_todo_tasks
     ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY id;`,
    values,
  };
}

export async function listTodosV2(
  filters: TodoFiltersV2 = {},
): Promise<TodoV2[]> {
  const query = buildTodoListQueryV2(filters);
  const result = await requirePool().query<TodoRowV2>(query.text, query.values);

  return result.rows.map(toTodoV2);
}

export async function createTodoV2(
  title: string,
  priority: TodoPriority,
): Promise<TodoV2> {
  const result = await requirePool().query<TodoRowV2>(
    `INSERT INTO v2_todo_tasks (title, priority)
     VALUES ($1, $2)
     RETURNING id, title, is_completed, priority, created_at;`,
    [title, priority],
  );

  const todo = result.rows[0];
  if (!todo) {
    throw new Error('V2 TODO insert did not return a row.');
  }

  return toTodoV2(todo);
}

export async function updateTodoV2(
  id: number,
  changes: TodoV2Changes,
): Promise<TodoV2 | null> {
  const assignments: string[] = [];
  const values: (number | boolean | TodoPriority)[] = [id];

  if (changes.isCompleted !== undefined) {
    values.push(changes.isCompleted);
    assignments.push(`is_completed = $${values.length}`);
  }
  if (changes.priority !== undefined) {
    values.push(changes.priority);
    assignments.push(`priority = $${values.length}`);
  }

  const result = await requirePool().query<TodoRowV2>(
    `UPDATE v2_todo_tasks
     SET ${assignments.join(', ')}
     WHERE id = $1
     RETURNING id, title, is_completed, priority, created_at;`,
    values,
  );

  const todo = result.rows[0];
  return todo ? toTodoV2(todo) : null;
}

export async function deleteTodoV2(id: number): Promise<boolean> {
  const result = await requirePool().query<{ id: number }>(
    `DELETE FROM v2_todo_tasks
     WHERE id = $1
     RETURNING id;`,
    [id],
  );

  return result.rows.length > 0;
}
