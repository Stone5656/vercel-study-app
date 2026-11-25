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

test('renders title and turn text safely and keeps question submission disabled', async ({
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
  await expect(page.locator('#question-prompt')).toBeDisabled();
  await expect(page.locator('#question-form button')).toBeDisabled();
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
