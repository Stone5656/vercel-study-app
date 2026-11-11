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
