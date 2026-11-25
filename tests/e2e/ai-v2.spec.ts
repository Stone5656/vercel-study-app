import { expect, test, type Page, type Route } from '@playwright/test';

type Conversation = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type Turn = {
  id: number;
  conversationId: number;
  prompt: string;
  response: string;
  createdAt: string;
};

const date = '2026-11-25T00:00:00.000Z';

function conversation(id: number, title = `Conversation ${id}`): Conversation {
  return { id, title, createdAt: date, updatedAt: date };
}

function turn(
  id: number,
  conversationId: number,
  prompt = `Question ${id}`,
  response = `Answer ${id}`,
): Turn {
  return { id, conversationId, prompt, response, createdAt: date };
}

async function mockV2Api(
  page: Page,
  conversations: Conversation[] = [],
  turns: Record<number, Turn[]> = {},
): Promise<void> {
  await page.route('**/api/ai/v2/conversations', async (route: Route) => {
    if (route.request().method() === 'POST') {
      const title = (route.request().postDataJSON() as { title: string }).title;
      const created = conversation(90, title);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: created }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: conversations }),
    });
  });
  await page.route('**/api/ai/v2/conversations/*/turns', (route) => {
    const match = route
      .request()
      .url()
      .match(/conversations\/(\d+)\/turns/);
    const id = Number(match?.[1]);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: turns[id] ?? [] }),
    });
  });
}

test('V2 page shows conversations, selected title and turns', async ({
  page,
}) => {
  await mockV2Api(page, [conversation(2), conversation(1)], {
    2: [turn(20, 2)],
  });
  await page.goto('/ai/v2/');

  await expect(
    page.getByRole('heading', { name: 'AI会話アプリ V2' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Conversation 2/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Conversation 2' }),
  ).toBeVisible();
  await expect(page.getByText('Question 20')).toBeVisible();
  await expect(page.getByText('Answer 20')).toBeVisible();
});

test('creates a conversation and selects the saved conversation', async ({
  page,
}) => {
  const list = [conversation(2)];
  await page.route('**/api/ai/v2/conversations', async (route) => {
    if (route.request().method() === 'POST') {
      const title = (route.request().postDataJSON() as { title: string }).title;
      const created = conversation(90, title);
      list.unshift(created);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: created }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: list }),
    });
  });
  await page.route('**/api/ai/v2/conversations/*/turns', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] }),
    }),
  );
  await page.goto('/ai/v2/');
  await page.getByLabel('新しい会話名').fill('  New topic  ');
  await page.getByRole('button', { name: '会話を作成' }).click();

  await expect(page.getByRole('heading', { name: 'New topic' })).toBeVisible();
  await expect(page.getByRole('button', { name: /New topic/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.getByLabel('新しい会話名')).toHaveValue('');
});

test('switches histories and does not mix turns between conversations', async ({
  page,
}) => {
  await mockV2Api(page, [conversation(1), conversation(2)], {
    1: [turn(1, 1, 'Only first', 'First answer')],
    2: [turn(2, 2, 'Only second', 'Second answer')],
  });
  await page.goto('/ai/v2/');
  await expect(page.getByText('Only first')).toBeVisible();
  await page.getByRole('button', { name: /Conversation 2/ }).click();

  await expect(page.getByText('Only second')).toBeVisible();
  await expect(page.getByText('Only first')).toHaveCount(0);
});

test('shows loading and empty states for a conversation without turns', async ({
  page,
}) => {
  let releaseTurns = (): void => undefined;
  const turnsWaiting = new Promise<void>((resolve) => {
    releaseTurns = resolve;
  });
  await page.route('**/api/ai/v2/conversations', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [conversation(1)] }),
    }),
  );
  await page.route('**/api/ai/v2/conversations/1/turns', async (route) => {
    await turnsWaiting;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] }),
    });
  });
  await page.goto('/ai/v2/');

  await expect(
    page.locator('#turns-status').filter({ hasText: '履歴を読み込んでいます' }),
  ).toBeVisible();
  await expect(page.locator('#turns-content')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  releaseTurns();
  await expect(page.locator('#turns-status')).toHaveText(
    'この会話にはまだ質問がありません。',
  );
  await expect(page.locator('#turns-content')).toHaveAttribute(
    'aria-busy',
    'false',
  );
});

test('discards an older history response after switching conversations', async ({
  page,
}) => {
  let finishFirst = (): void => undefined;
  const firstWaiting = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  await page.route('**/api/ai/v2/conversations', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        items: [conversation(1), conversation(2)],
      }),
    }),
  );
  await page.route('**/api/ai/v2/conversations/*/turns', async (route) => {
    if (route.request().url().includes('/1/turns')) {
      await firstWaiting;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [turn(1, 1, 'stale')] }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [turn(2, 2, 'current')] }),
    });
  });
  await page.goto('/ai/v2/');
  await page.getByRole('button', { name: /Conversation 2/ }).click();
  await expect(page.getByText('current')).toBeVisible();
  finishFirst();

  await expect(page.getByText('stale')).toHaveCount(0);
  await expect(page.getByText('current')).toBeVisible();
});

test('renders title and turn text safely and rejects an empty question without submission', async ({
  page,
}) => {
  await mockV2Api(page, [conversation(1, '<img src=x onerror=alert(1)>')], {
    1: [turn(1, 1, '<script>bad()</script>', '<img src=x onerror=alert(2)>')],
  });
  let submitRequests = 0;
  await page.route('**/api/ai/v2/conversations/*/turns', async (route) => {
    if (route.request().method() === 'POST') submitRequests += 1;
    const id = Number(
      route
        .request()
        .url()
        .match(/conversations\/(\d+)\/turns/)?.[1],
    );
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        items: [
          turn(1, id, '<script>bad()</script>', '<img src=x onerror=alert(2)>'),
        ],
      }),
    });
  });
  await page.goto('/ai/v2/');

  await expect(page.getByText('<script>bad()</script>')).toBeVisible();
  await expect(page.locator('#selected-title')).toHaveText(
    '<img src=x onerror=alert(1)>',
  );
  await expect(
    page.locator('#conversation-list img, #turn-list img, #turn-list script'),
  ).toHaveCount(0);
  await expect(page.locator('script:not([src])')).toHaveCount(0);
  await expect(page.locator('#question-prompt')).toBeEnabled();
  await expect(page.locator('#question-form button')).toBeEnabled();
  await page.locator('#question-form').evaluate((form) => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  expect(submitRequests).toBe(0);
});

test('distinguishes a disabled API from an empty conversation list', async ({
  page,
}) => {
  await page.route('**/api/ai/v2/conversations', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'DEMO_DISABLED', message: 'private detail' },
      }),
    }),
  );
  await page.goto('/ai/v2/');

  await expect(page.locator('#conversation-status')).toContainText(
    'AI会話機能は現在利用できません。',
  );
  await expect(page.getByText('private detail')).toHaveCount(0);
});

async function setupAskPage(
  page: Page,
  handlers: {
    create?: (route: Route) => Promise<void>;
    post?: (route: Route) => Promise<void>;
    getTurns?: (route: Route, call: number) => Promise<void>;
  } = {},
): Promise<{ getTurnsCalls: () => number }> {
  let getTurnsCalls = 0;
  await page.route('**/api/ai/v2/conversations', async (route) => {
    if (route.request().method() === 'POST') {
      if (handlers.create) {
        await handlers.create(route);
      } else {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item: conversation(90) }),
        });
      }
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [conversation(1)] }),
    });
  });
  await page.route('**/api/ai/v2/conversations/1/turns', async (route) => {
    if (route.request().method() === 'POST') {
      await handlers.post?.(route);
      return;
    }
    getTurnsCalls += 1;
    if (handlers.getTurns) {
      await handlers.getTurns(route, getTurnsCalls);
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] }),
    });
  });
  await page.goto('/ai/v2/');
  await expect(page.locator('#question-prompt')).toBeEnabled();
  return { getTurnsCalls: () => getTurnsCalls };
}

function savedTurnPayload(prompt: string, response = 'Saved response') {
  return {
    success: true,
    item: {
      id: 2,
      conversationId: 1,
      prompt,
      response,
      createdAt: date,
    },
  };
}

test('submits a question, renders the saved response and refreshes history', async ({
  page,
}) => {
  let postCalls = 0;
  let getCalls = 0;
  const prompt = 'How is this stored?';
  await setupAskPage(page, {
    async post(route) {
      postCalls += 1;
      expect(route.request().postDataJSON()).toEqual({ prompt });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(savedTurnPayload(prompt)),
      });
    },
    async getTurns(route, call) {
      getCalls = call;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: call > 1 ? [{ ...savedTurnPayload(prompt).item }] : [],
        }),
      });
    },
  });
  await page.locator('#question-prompt').fill(prompt);
  await page.getByRole('button', { name: '質問を送信' }).click();

  await expect(page.locator('#latest-answer-response')).toHaveText(
    'Saved response',
  );
  await expect(page.locator('#question-prompt')).toHaveValue('');
  await expect(page.locator('#latest-answer-prompt')).toHaveText(prompt);
  await expect.poll(() => postCalls).toBe(1);
  await expect.poll(() => getCalls).toBe(2);
});

test('keeps the saved answer when the post-save history refresh fails', async ({
  page,
}) => {
  const prompt = 'Saved despite refresh issue';
  let getCalls = 0;
  await setupAskPage(page, {
    async post(route) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(savedTurnPayload(prompt, 'Answer retained')),
      });
    },
    async getTurns(route, call) {
      getCalls = call;
      if (call === 1) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true, items: [] }),
        });
      } else {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { code: 'DB_UNAVAILABLE', message: 'private db detail' },
          }),
        });
      }
    },
  });
  await page.locator('#question-prompt').fill(prompt);
  await page.getByRole('button', { name: '質問を送信' }).click();

  await expect(page.locator('#latest-answer-response')).toHaveText(
    'Answer retained',
  );
  await expect(page.locator('#submit-status')).toHaveText(
    '回答は保存されましたが、履歴の更新に失敗しました。',
  );
  await expect(page.locator('#question-prompt')).toHaveValue('');
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeEnabled();
  expect(getCalls).toBe(2);
  await expect(page.getByText('private db detail')).toHaveCount(0);
});

test('rejects invalid prompt values without a POST', async ({ page }) => {
  let postCalls = 0;
  await setupAskPage(page, {
    async post(route) {
      postCalls += 1;
      await route.fulfill({ status: 500, body: '{}' });
    },
  });
  const input = page.locator('#question-prompt');
  const submit = page.getByRole('button', { name: '質問を送信' });

  await input.fill('   ');
  await submit.click();
  await expect(page.locator('#submit-status')).toHaveText(
    '質問は空白以外の文字を1〜2,000文字で入力してください。',
  );
  await input.fill('😀'.repeat(2001));
  await submit.click();
  await expect(page.locator('#submit-status')).toHaveText(
    '質問は空白以外の文字を1〜2,000文字で入力してください。',
  );
  expect(postCalls).toBe(0);
});

test('locks the form during submission and ignores duplicate submit events', async ({
  page,
}) => {
  let finishPost = (): void => undefined;
  const postWaiting = new Promise<void>((resolve) => {
    finishPost = resolve;
  });
  let postCalls = 0;
  await setupAskPage(page, {
    async post(route) {
      postCalls += 1;
      await postWaiting;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(savedTurnPayload('once')),
      });
    },
  });
  await page.locator('#question-prompt').fill('once');
  await page.getByRole('button', { name: '質問を送信' }).click();
  await expect(page.locator('#submit-status')).toHaveText(
    '回答を生成しています。',
  );
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: /Conversation 1/ }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: '会話を作成' })).toBeDisabled();
  await page.locator('#question-form').evaluate((form) => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  await expect.poll(() => postCalls).toBe(1);
  finishPost();
  await expect(page.locator('#latest-answer-response')).toHaveText(
    'Saved response',
  );
});

test('locks conversation switching and questions while creating a conversation', async ({
  page,
}) => {
  let finishCreate = (): void => undefined;
  const createWaiting = new Promise<void>((resolve) => {
    finishCreate = resolve;
  });
  let createCalls = 0;
  await setupAskPage(page, {
    async create(route) {
      createCalls += 1;
      await createWaiting;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: conversation(90, 'New') }),
      });
    },
  });
  await page.locator('#conversation-title').fill('New');
  await page.getByRole('button', { name: '会話を作成' }).click();
  await expect(
    page.getByRole('button', { name: 'Conversation 1' }),
  ).toBeDisabled();
  await expect(page.locator('#question-prompt')).toBeDisabled();
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeDisabled();
  expect(createCalls).toBe(1);
  finishCreate();
  await expect(page.locator('#conversation-title')).toHaveValue('');
  await expect(page.locator('#question-prompt')).toBeEnabled();
});

test('retains input and maps API error codes to fixed safe messages', async ({
  browser,
}) => {
  const errors = [
    [400, 'VALIDATION_ERROR', '入力内容を確認してください。'],
    [400, 'INVALID_JSON', '通信内容を確認できませんでした。'],
    [
      413,
      'PAYLOAD_TOO_LARGE',
      '質問が長すぎます。短くしてからお試しください。',
    ],
    [415, 'UNSUPPORTED_MEDIA_TYPE', '通信形式に問題があります。'],
    [502, 'AI_UNAVAILABLE', 'AIから回答を取得できませんでした。'],
    [
      503,
      'DB_UNAVAILABLE',
      'データベースを利用できません。履歴を確認してください。',
    ],
    [503, 'DEMO_DISABLED', 'AI会話機能は現在利用できません。'],
    [
      404,
      'CONVERSATION_NOT_FOUND',
      '会話が見つかりません。会話一覧を更新してください。',
    ],
    [
      409,
      'CONVERSATION_CHANGED',
      '会話が更新されました。履歴を確認してから質問してください。',
    ],
    [
      500,
      'INTERNAL_ERROR',
      '処理中にエラーが発生しました。時間をおいてお試しください。',
    ],
  ] as const;

  for (const [status, code, message] of errors) {
    const context = await browser.newContext();
    const errorPage = await context.newPage();
    await setupAskPage(errorPage, {
      async post(route) {
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { code, message: 'private server message' },
          }),
        });
      },
    });
    await errorPage.locator('#question-prompt').fill('keep this input');
    await errorPage.getByRole('button', { name: '質問を送信' }).click();
    await expect(errorPage.locator('#submit-status')).toHaveText(message);
    await expect(errorPage.locator('#question-prompt')).toHaveValue(
      'keep this input',
    );
    await expect(errorPage.getByText('private server message')).toHaveCount(0);
    await expect(
      errorPage.getByRole('button', { name: '質問を送信' }),
    ).toBeEnabled();
    await context.close();
  }
});

test('shows an uncertain result on POST timeout without automatic retry', async ({
  page,
}) => {
  await page.clock.install();
  let postCalls = 0;
  let finishPost = (): void => undefined;
  const waiting = new Promise<void>((resolve) => {
    finishPost = resolve;
  });
  await setupAskPage(page, {
    async post(route) {
      postCalls += 1;
      await waiting;
      try {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(savedTurnPayload('maybe saved')),
        });
      } catch {
        // The page intentionally aborts this request when the browser timeout expires.
      }
    },
  });
  await page.locator('#question-prompt').fill('maybe saved');
  await page.getByRole('button', { name: '質問を送信' }).click();
  await expect(page.locator('#submit-status')).toHaveText(
    '回答を生成しています。',
  );
  await page.clock.fastForward(45_000);

  await expect(page.locator('#submit-status')).toHaveText(
    '45秒以内に応答がありませんでした。保存結果は不明です。再送せず、履歴を確認してください。',
  );
  await expect(page.locator('#question-prompt')).toHaveValue('maybe saved');
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeEnabled();
  expect(postCalls).toBe(1);
  finishPost();
});

test('timeout during post-save history refresh preserves response and unlocks controls', async ({
  page,
}) => {
  await page.clock.install();
  let finishHistory = (): void => undefined;
  const historyWaiting = new Promise<void>((resolve) => {
    finishHistory = resolve;
  });
  await setupAskPage(page, {
    async post(route) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(savedTurnPayload('saved', 'still visible')),
      });
    },
    async getTurns(route, call) {
      if (call === 1) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true, items: [] }),
        });
        return;
      }
      await historyWaiting;
      try {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true, items: [] }),
        });
      } catch {
        // History fetch has been locally aborted by the UI timeout.
      }
    },
  });
  await page.locator('#question-prompt').fill('saved');
  await page.getByRole('button', { name: '質問を送信' }).click();
  await expect(page.locator('#latest-answer-response')).toHaveText(
    'still visible',
  );
  await page.clock.fastForward(15_000);

  await expect(page.locator('#submit-status')).toHaveText(
    '回答は保存されましたが、履歴の更新に失敗しました。',
  );
  await expect(page.locator('#latest-answer-response')).toHaveText(
    'still visible',
  );
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeEnabled();
  await expect(page.locator('#turns-content')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  finishHistory();
});

test('renders HTML-like question and answer only as text', async ({ page }) => {
  const prompt = '<img src=x onerror=alert(1)>';
  const answer = '<script>window.compromised = true</script>';
  await setupAskPage(page, {
    async post(route) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(savedTurnPayload(prompt, answer)),
      });
    },
  });
  await page.locator('#question-prompt').fill(prompt);
  await page.getByRole('button', { name: '質問を送信' }).click();

  await expect(page.locator('#latest-answer-prompt')).toHaveText(prompt);
  await expect(page.locator('#latest-answer-response')).toHaveText(answer);
  await expect(
    page.locator('#latest-answer img, #latest-answer script'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, 'compromised')),
  ).toBeUndefined();
});

test('treats malformed 201 and network failure as uncertain without retry', async ({
  browser,
}) => {
  const cases: Array<{
    name: string;
    routePost: (route: Route) => Promise<void>;
  }> = [
    {
      name: 'malformed 201 response',
      async routePost(route) {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: '{',
        });
      },
    },
    {
      name: 'network failure',
      async routePost(route) {
        await route.abort('failed');
      },
    },
  ];

  for (const testCase of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let postCalls = 0;
    await setupAskPage(page, {
      async post(route) {
        postCalls += 1;
        await testCase.routePost(route);
      },
    });
    await page.locator('#question-prompt').fill(testCase.name);
    await page.getByRole('button', { name: '質問を送信' }).click();

    await expect(page.locator('#submit-status')).toContainText(
      '保存されている可能性があるため、再送せず履歴を確認してください。',
    );
    await expect(page.locator('#question-prompt')).toHaveValue(testCase.name);
    await expect(
      page.getByRole('button', { name: '質問を送信' }),
    ).toBeEnabled();
    expect(postCalls).toBe(1);
    await context.close();
  }
});
