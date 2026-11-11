import type { TodoDto } from './todo.js';

export type TodoPriority = 'low' | 'normal' | 'high';

export type TodoFiltersV2 = {
  completed?: boolean;
  priority?: TodoPriority | '';
};

export class TodoApiV2 {
  constructor(baseUrl?: string);
  list(
    filters?: TodoFiltersV2,
  ): Promise<(TodoDto & { priority: TodoPriority })[]>;
  create(
    title: string,
    priority?: TodoPriority,
  ): Promise<TodoDto & { priority: TodoPriority }>;
  update(
    id: number,
    changes: { isCompleted?: boolean; priority?: TodoPriority },
  ): Promise<TodoDto & { priority: TodoPriority }>;
  delete(id: number): Promise<void>;
}
