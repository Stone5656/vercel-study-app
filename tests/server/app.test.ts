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
});
