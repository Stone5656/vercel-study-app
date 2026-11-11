import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import { app } from '../../src/app.js';

describe('GET /', () => {
  it('renders the home page with EJS', async () => {
    const response = await request(app).get('/');

    assert.equal(response.status, 200);
    assert.match(response.text, /My Express Site/);
  });

  it('GET /todo renders the TODO app and serves its module', async () => {
    const page = await request(app).get('/todo');
    const script = await request(app).get('/todo/todo.js');

    assert.equal(page.status, 200);
    assert.match(page.text, /TODO一覧/);
    assert.match(page.text, /\/todo\/todo\.js/);
    assert.equal(script.status, 200);
    assert.match(script.text, /class TodoApi/);
  });
});
