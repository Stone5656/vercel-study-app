import { expect, test, type Page, type Route } from '@playwright/test';

type HistoryItem = {
  id: number;
  prompt: string;
  response: string;
  createdAt: string;
};

function makeItem(id: number, prompt = `質問 ${id}`): HistoryItem {
  return {
    id,
    prompt,
    response: `回答 ${id}`,
    createdAt: '2026-11-18T04:00:00.000Z',
  };
}

async function mockHistory(
  page: Page,
  items: unknown = [],
  status = 200,
): Promise<void> {
  await page.route('**/api/ai/history', (route: Route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items }),
    }),
  );
}

test('UI01 /ai redirects to the static history page', async ({ page }) => {
  await mockHistory(page);
  await page.goto('/ai');

  await expect(page).toHaveURL(/\/ai\/$/);
  await expect(
    page.getByRole('heading', { name: 'AI質問アプリ' }),
  ).toBeVisible();
});

test('UI02 the TOP link opens the AI history page', async ({ page }) => {
  await mockHistory(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'AI質問アプリ' }).click();

  await expect(page).toHaveURL(/\/ai\/$/);
  await expect(
    page.getByRole('heading', { name: 'AI質問アプリ' }),
  ).toBeVisible();
});

test('UI03 renders three history entries and their dates', async ({ page }) => {
  await mockHistory(page, [makeItem(3), makeItem(2), makeItem(1)]);
  await page.goto('/ai/');

  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('質問 3')).toBeVisible();
  await expect(page.getByText('回答 3')).toBeVisible();
  await expect(page.locator('#history-list time').first()).toContainText(
    '2026',
  );
});

test('UI04 shows the empty state for an empty history', async ({ page }) => {
  await mockHistory(page, []);
  await page.goto('/ai/');

  await expect(page.getByRole('status')).toHaveText('履歴がありません');
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('UI05 announces loading and clears the busy state after the response', async ({
  page,
}) => {
  let finishRequest = (): void => {};
  const waiting = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  await page.route('**/api/ai/history', async (route) => {
    await waiting;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] }),
    });
  });

  await page.goto('/ai/');
  await expect(page.getByRole('status')).toHaveText('履歴を読み込んでいます');
  await expect(page.locator('#history-content')).toHaveAttribute(
    'aria-busy',
    'true',
  );

  finishRequest();
  await expect(page.locator('#history-content')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByRole('status')).toHaveText('履歴がありません');
});

test('UI06 shows a safe error for a database failure', async ({ page }) => {
  await page.route('**/api/ai/history', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'DB_UNAVAILABLE', message: 'private database detail' },
      }),
    }),
  );
  await page.goto('/ai/');

  await expect(page.getByRole('status')).toHaveText(
    '履歴を読み込めませんでした。時間をおいてご確認ください。',
  );
  await expect(page.getByText('private database detail')).toHaveCount(0);
  await expect(page.getByText('履歴がありません')).toHaveCount(0);
});

test('UI07 shows the disabled state for DEMO_DISABLED', async ({ page }) => {
  await page.route('**/api/ai/history', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'DEMO_DISABLED', message: 'private detail' },
      }),
    }),
  );
  await page.goto('/ai/');

  await expect(page.getByRole('status')).toHaveText(
    'AI質問機能は現在利用できません。',
  );
  await expect(page.getByText('履歴がありません')).toHaveCount(0);
});

test('UI08 shows a safe error for invalid JSON', async ({ page }) => {
  await page.route('**/api/ai/history', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{invalid-json',
    }),
  );
  await page.goto('/ai/');

  await expect(page.getByRole('status')).toContainText('履歴を読み込めません');
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('UI09 shows a safe error for an invalid response structure', async ({
  page,
}) => {
  await mockHistory(page, [
    { id: 'not-an-id', prompt: '<script>', response: 4 },
  ]);
  await page.goto('/ai/');

  await expect(page.getByRole('status')).toContainText('履歴を読み込めません');
  await expect(page.getByText('<script>')).toHaveCount(0);
});

test('UI10 displays prompt and response HTML as text without executing it', async ({
  page,
}) => {
  const prompt = '<img src=x onerror="window.__xss = true">質問';
  const response = '<svg onload="window.__xss = true">回答</svg>';
  await mockHistory(page, [
    {
      id: 1,
      prompt,
      response,
      createdAt: '2026-11-18T04:00:00.000Z',
    },
  ]);
  await page.goto('/ai/');

  await expect(page.getByRole('heading', { name: prompt })).toBeVisible();
  await expect(page.getByText(response, { exact: true })).toBeVisible();
  await expect(
    page.locator('#history-list img, #history-list svg'),
  ).toHaveCount(0);
  expect(await page.evaluate('window.__xss')).toBeUndefined();
});

test('UI11 limits display to twenty items and preserves API order', async ({
  page,
}) => {
  await mockHistory(
    page,
    Array.from({ length: 21 }, (_, index) => makeItem(21 - index)),
  );
  await page.goto('/ai/');

  await expect(page.getByRole('listitem')).toHaveCount(20);
  await expect(page.getByRole('listitem').first()).toContainText('質問 21');
  await expect(page.getByRole('listitem').last()).toContainText('質問 2');
});

test('UI12 reload fetches the mocked history again', async ({ page }) => {
  let requestCount = 0;
  await page.route('**/api/ai/history', (route) => {
    requestCount += 1;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [makeItem(1)] }),
    });
  });

  await page.goto('/ai/');
  await expect(page.getByText('質問 1')).toBeVisible();
  await page.reload();
  await expect(page.getByText('質問 1')).toBeVisible();
  expect(requestCount).toBe(2);
});

test('UI13 clears loading state after a failed request', async ({ page }) => {
  await page.route('**/api/ai/history', (route) => route.abort());
  await page.goto('/ai/');

  await expect(page.getByRole('status')).toContainText('履歴を読み込めません');
  await expect(page.locator('#history-content')).toHaveAttribute(
    'aria-busy',
    'false',
  );
});

test('UI14 displays the question form for the later send interaction', async ({
  page,
}) => {
  await mockHistory(page);
  await page.goto('/ai/');

  await expect(page.getByLabel('質問本文')).toBeVisible();
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeEnabled();
});

test('renders an invalid date without breaking the history page', async ({
  page,
}) => {
  await mockHistory(page, [
    {
      id: 1,
      prompt: '質問',
      response: '回答',
      createdAt: 'invalid date',
    },
  ]);
  await page.goto('/ai/');

  await expect(page.getByText('日時不明')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '質問', exact: true }),
  ).toBeVisible();
});
