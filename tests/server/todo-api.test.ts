import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { TodoApi } from '../../public/todo/todo.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('TodoApi', () => {
  it('listはGETで一覧を取得する', async () => {
    let requestUrl = '';
    let requestMethod = '';
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestMethod = init?.method ?? 'GET';
      return Response.json({ status: 'success', data: [] });
    }) as typeof fetch;

    const todos = await new TodoApi().list();

    assert.deepEqual(todos, []);
    assert.equal(requestUrl, '/api/v1/todos');
    assert.equal(requestMethod, 'GET');
  });

  it('createはJSON POSTを送る', async () => {
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestInit = init;
      return Response.json(
        { status: 'success', data: { id: 1, title: 'TODO' } },
        { status: 201 },
      );
    }) as typeof fetch;

    const todo = await new TodoApi().create('TODO');

    assert.equal(todo.id, 1);
    assert.equal(requestInit?.method, 'POST');
    assert.equal(
      (requestInit?.headers as Record<string, string>)['Content-Type'],
      'application/json',
    );
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { title: 'TODO' });
  });

  it('updateはJSON PATCHを送る', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return Response.json({ status: 'success', data: { id: 3 } });
    }) as typeof fetch;

    await new TodoApi().update(3, true);

    assert.equal(requestUrl, '/api/v1/todos/3');
    assert.equal(requestInit?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      isCompleted: true,
    });
  });

  it('deleteは204本文をJSON解析しない', async () => {
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestInit = init;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await assert.doesNotReject(() => new TodoApi().delete(4));
    assert.equal(requestInit?.method, 'DELETE');
  });

  it('APIのエラーメッセージを呼び出し側へ返す', async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { status: 'error', code: 'VALIDATION_ERROR', message: '入力エラー' },
        { status: 422 },
      )) as typeof fetch;

    await assert.rejects(() => new TodoApi().list(), /入力エラー/);
  });
});
