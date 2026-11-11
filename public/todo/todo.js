export class TodoApi {
  constructor(baseUrl = '/api/v1/todos') {
    this.baseUrl = baseUrl;
  }

  async list() {
    const response = await fetch(this.baseUrl);
    const payload = await this.parseResponse(response);
    return payload.data;
  }

  async create(title) {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const payload = await this.parseResponse(response);
    return payload.data;
  }

  async update(id, isCompleted) {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted }),
    });
    const payload = await this.parseResponse(response);
    return payload.data;
  }

  async delete(id) {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (response.status === 204) {
      return;
    }

    await this.parseResponse(response);
  }

  async parseResponse(response) {
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? 'リクエストに失敗しました');
    }

    if (response.status === 204) {
      return undefined;
    }

    return response.json();
  }
}

function startTodoApp() {
  const api = new TodoApi();
  const form = document.querySelector('#todo-form');
  const titleInput = document.querySelector('#todo-title');
  const submitButton = document.querySelector('#todo-submit');
  const status = document.querySelector('#todo-status');
  const error = document.querySelector('#todo-error');
  const list = document.querySelector('#todo-list');

  function showError(message = '') {
    error.textContent = message;
    error.hidden = message.length === 0;
  }

  function setBusy(isBusy, message = '') {
    submitButton.disabled = isBusy;
    titleInput.disabled = isBusy;
    status.textContent = message;
    list.setAttribute('aria-busy', String(isBusy));
  }

  function renderTodos(todos) {
    list.replaceChildren();
    if (todos.length === 0) {
      status.textContent = 'TODOがありません';
      return;
    }

    status.textContent = `${todos.length}件のTODO`;
    for (const todo of todos) {
      const item = document.createElement('li');
      item.className = 'todo-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.isCompleted;
      checkbox.setAttribute('aria-label', `${todo.title}を完了にする`);
      checkbox.addEventListener('change', async () => {
        await runAction(async () => {
          await api.update(todo.id, checkbox.checked);
          await loadTodos();
        });
      });

      const title = document.createElement('span');
      title.className = todo.isCompleted
        ? 'todo-title is-completed'
        : 'todo-title';
      title.textContent = todo.title;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = '削除';
      removeButton.addEventListener('click', async () => {
        await runAction(async () => {
          await api.delete(todo.id);
          await loadTodos();
        });
      });

      item.append(checkbox, title, removeButton);
      list.append(item);
    }
  }

  async function runAction(action) {
    showError();
    setBusy(true, '処理中…');
    try {
      await action();
    } catch (actionError) {
      showError(actionError.message || '処理に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function loadTodos() {
    try {
      renderTodos(await api.list());
    } catch (loadError) {
      list.replaceChildren();
      status.textContent = '';
      showError(loadError.message || 'TODOを取得できませんでした');
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = titleInput.value;
    await runAction(async () => {
      await api.create(title);
      form.reset();
      await loadTodos();
    });
  });

  void loadTodos();
}

if (typeof document !== 'undefined') {
  startTodoApp();
}
