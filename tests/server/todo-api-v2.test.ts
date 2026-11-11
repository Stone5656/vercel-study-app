import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { TodoApiV2 } from '../../public/todo/todo-v2.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('TodoApiV2', () => {
  it('listはfilterをquery stringへ変換する', async () => {
    let requestUrl = '';
    globalThis.fetch = (async (input) => {
      requestUrl = String(input);
      return Response.json({ status: 'success', data: [] });
    }) as typeof fetch;

    await new TodoApiV2().list({ completed: false, priority: 'high' });

    assert.equal(requestUrl, '/api/v2/todos?completed=false&priority=high');
  });

  it('空filterはquery stringを付けない', async () => {
    let requestUrl = '';
    globalThis.fetch = (async (input) => {
      requestUrl = String(input);
      return Response.json({ status: 'success', data: [] });
    }) as typeof fetch;

    await new TodoApiV2().list({});
    assert.equal(requestUrl, '/api/v2/todos');
  });

  it('createはpriority付きJSON POSTを送る', async () => {
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestInit = init;
      return Response.json(
        { status: 'success', data: { id: 7, priority: 'low' } },
        { status: 201 },
      );
    }) as typeof fetch;

    const todo = await new TodoApiV2().create('V2 item', 'low');
    assert.equal(todo.priority, 'low');
    assert.equal(requestInit?.method, 'POST');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      title: 'V2 item',
      priority: 'low',
    });
  });

  it('updateは複数変更をPATCHで送る', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return Response.json({ status: 'success', data: { id: 7 } });
    }) as typeof fetch;

    await new TodoApiV2().update(7, { isCompleted: true, priority: 'high' });
    assert.equal(requestUrl, '/api/v2/todos/7');
    assert.equal(requestInit?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      isCompleted: true,
      priority: 'high',
    });
  });

  it('deleteは204をJSON解析しない', async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 204 })) as typeof fetch;
    await assert.doesNotReject(() => new TodoApiV2().delete(7));
  });

  it('エラーJSONのmessageを呼び出し側へ伝える', async () => {
    globalThis.fetch = (async () =>
      Response.json(
        {
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'priority error',
        },
        { status: 422 },
      )) as typeof fetch;
    await assert.rejects(() => new TodoApiV2().list(), /priority error/);
  });
});
