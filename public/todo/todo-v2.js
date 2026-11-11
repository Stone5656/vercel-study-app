export class TodoApiV2 {
  constructor(baseUrl = '/api/v2/todos') {
    this.baseUrl = baseUrl;
  }

  async list(filters = {}) {
    const query = new URLSearchParams();
    if (filters.completed !== undefined) {
      query.set('completed', String(filters.completed));
    }
    if (filters.priority !== undefined && filters.priority !== '') {
      query.set('priority', filters.priority);
    }
    const search = query.toString();
    const response = await fetch(
      search ? `${this.baseUrl}?${search}` : this.baseUrl,
    );
    const payload = await this.parseResponse(response);
    return payload.data;
  }

  async create(title, priority = 'normal') {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, priority }),
    });
    const payload = await this.parseResponse(response);
    return payload.data;
  }

  async update(id, changes) {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    const payload = await this.parseResponse(response);
    return payload.data;
  }

  async delete(id) {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (response.status === 204) return;
    await this.parseResponse(response);
  }

  async parseResponse(response) {
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? 'リクエストに失敗しました');
    }
    if (response.status === 204) return undefined;
    return response.json();
  }
}

function startTodoAppV2() {
  const api = new TodoApiV2();
  const form = document.querySelector('#todo-v2-form');
  const titleInput = document.querySelector('#todo-v2-title');
  const priorityInput = document.querySelector('#todo-v2-priority');
  const submitButton = document.querySelector('#todo-v2-submit');
  const completedFilter = document.querySelector('#todo-v2-filter-completed');
  const priorityFilter = document.querySelector('#todo-v2-filter-priority');
  const resetButton = document.querySelector('#todo-v2-filter-reset');
  const status = document.querySelector('#todo-v2-status');
  const error = document.querySelector('#todo-v2-error');
  const list = document.querySelector('#todo-v2-list');

  function showError(message = '') {
    error.textContent = message;
    error.hidden = message.length === 0;
  }

  function getFilters() {
    const filters = {};
    if (completedFilter.value !== '') {
      filters.completed = completedFilter.value === 'true';
    }
    if (priorityFilter.value !== '') {
      filters.priority = priorityFilter.value;
    }
    return filters;
  }

  function setBusy(isBusy, message = '') {
    submitButton.disabled = isBusy;
    titleInput.disabled = isBusy;
    completedFilter.disabled = isBusy;
    priorityFilter.disabled = isBusy;
    resetButton.disabled = isBusy;
    list.setAttribute('aria-busy', String(isBusy));
    for (const control of list.querySelectorAll('input, select, button')) {
      control.disabled = isBusy;
    }
    status.textContent = message;
  }

  function renderTodos(todos) {
    list.replaceChildren();
    if (todos.length === 0) {
      status.textContent = 'TODOがありません';
      return;
    }
    status.textContent = `${todos.length}件のTODO`;

    const priorityLabels = { low: '低', normal: '通常', high: '高' };
    for (const todo of todos) {
      const item = document.createElement('li');
      item.className = 'todo-item';
      item.dataset.todoId = String(todo.id);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.isCompleted;
      checkbox.setAttribute('aria-label', `${todo.title}を完了にする`);
      checkbox.addEventListener('change', async () => {
        await runAction(async () => {
          await api.update(todo.id, { isCompleted: checkbox.checked });
          await loadTodos();
        });
      });

      const title = document.createElement('span');
      title.className = todo.isCompleted
        ? 'todo-title is-completed'
        : 'todo-title';
      title.textContent = todo.title;

      const priority = document.createElement('select');
      priority.setAttribute('aria-label', `${todo.title}の優先度`);
      for (const value of ['low', 'normal', 'high']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = priorityLabels[value];
        priority.append(option);
      }
      priority.value = todo.priority;
      priority.addEventListener('change', async () => {
        await runAction(async () => {
          await api.update(todo.id, { priority: priority.value });
          await loadTodos();
        });
      });

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = '削除';
      removeButton.addEventListener('click', async () => {
        await runAction(async () => {
          await api.delete(todo.id);
          await loadTodos();
        });
      });

      item.append(checkbox, title, priority, removeButton);
      list.append(item);
    }
  }

  async function loadTodos() {
    try {
      renderTodos(await api.list(getFilters()));
    } catch (loadError) {
      list.replaceChildren();
      status.textContent = '';
      showError(loadError.message || 'TODOを取得できませんでした');
    }
  }

  async function runAction(action) {
    showError();
    setBusy(true, '処理中…');
    try {
      await action();
    } catch (actionError) {
      showError(actionError.message || '処理に失敗しました');
      await loadTodos();
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runAction(async () => {
      await api.create(titleInput.value, priorityInput.value);
      form.reset();
      await loadTodos();
    });
  });

  completedFilter.addEventListener('change', () => void loadTodos());
  priorityFilter.addEventListener('change', () => void loadTodos());
  resetButton.addEventListener('click', () => {
    completedFilter.value = '';
    priorityFilter.value = '';
    void loadTodos();
  });

  void loadTodos();
}

if (typeof document !== 'undefined') {
  startTodoAppV2();
}
