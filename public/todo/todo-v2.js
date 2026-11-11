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
