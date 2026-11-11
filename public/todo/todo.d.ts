export type TodoDto = {
  id: number;
  title: string;
  isCompleted: boolean;
  createdAt: string;
};

export class TodoApi {
  constructor(baseUrl?: string);
  list(): Promise<TodoDto[]>;
  create(title: string): Promise<TodoDto>;
  update(id: number, isCompleted: boolean): Promise<TodoDto>;
  delete(id: number): Promise<void>;
}
