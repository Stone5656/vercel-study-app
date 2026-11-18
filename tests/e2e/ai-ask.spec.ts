import { expect, test, type Page, type Route } from '@playwright/test';

type AiItem = {
  id: number;
  prompt: string;
  response: string;
  createdAt: string;
};

const createdAt = '2026-11-18T04:00:00.000Z';

function item(id: number, prompt: string, response = `回答 ${id}`): AiItem {
  return { id, prompt, response, createdAt };
}

async function mockHistory(
  page: Page,
  getItems: () => AiItem[] = () => [],
): Promise<void> {
  await page.route('**/api/ai/history', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: getItems() }),
    }),
  );
}

async function mockAskSuccess(page: Page, response = '保存されたAI回答') {
  await page.route('**/api/ai/ask', async (route) => {
    const requestBody = route.request().postDataJSON() as { prompt: string };
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        item: item(42, requestBody.prompt, response),
      }),
    });
  });
}

async function submitPrompt(page: Page, prompt = '質問本文') {
  await page.getByLabel('質問本文').fill(prompt);
  await page.getByRole('button', { name: '質問を送信' }).click();
}

test('UI15 displays the saved answer after a successful 201 response', async ({
  page,
}) => {
  await mockHistory(page);
  await mockAskSuccess(page);
  await page.goto('/ai/');
  await submitPrompt(page, '  仕組みを説明して  ');

  await expect(page.locator('#answer-response')).toHaveText('保存されたAI回答');
  await expect(page.locator('#answer-prompt')).toHaveText('仕組みを説明して');
  await expect(
    page.getByRole('status').filter({ hasText: '回答を保存しました。' }),
  ).toBeVisible();
});

test('UI16 clears the input only after a valid successful response', async ({
  page,
}) => {
  await mockHistory(page);
  await mockAskSuccess(page);
  await page.goto('/ai/');
  await submitPrompt(page);

  await expect(page.getByLabel('質問本文')).toHaveValue('');
  await expect(page.locator('#answer-panel')).toBeVisible();
});

test('UI17 refreshes history after POST succeeds', async ({ page }) => {
  let historyRequestCount = 0;
  await mockHistory(page, () => {
    historyRequestCount += 1;
    return historyRequestCount === 1 ? [] : [item(42, '質問本文')];
  });
  await mockAskSuccess(page);
  await page.goto('/ai/');
  await submitPrompt(page);

  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('listitem').first()).toContainText('質問本文');
  expect(historyRequestCount).toBe(2);
});

test('UI18 keeps the answer successful if the follow-up history request fails', async ({
  page,
}) => {
  let historyRequestCount = 0;
  await page.route('**/api/ai/history', (route) => {
    historyRequestCount += 1;
    if (historyRequestCount === 1) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] }),
      });
    }
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'DB_UNAVAILABLE', message: 'private db details' },
      }),
    });
  });
  await mockAskSuccess(page);
  await page.goto('/ai/');
  await submitPrompt(page);

  await expect(page.locator('#answer-response')).toHaveText('保存されたAI回答');
  await expect(page.getByLabel('質問本文')).toHaveValue('');
  await expect(page.locator('#submit-status')).toHaveText(
    '回答は保存されましたが、履歴の更新に失敗しました。',
  );
  await expect(page.locator('#history-status')).toContainText(
    '履歴を読み込めませんでした',
  );
  await expect(page.getByText('private db details')).toHaveCount(0);
});

test('UI19 rejects blank input without sending a POST', async ({ page }) => {
  await mockHistory(page);
  let postCount = 0;
  await page.route('**/api/ai/ask', (route) => {
    postCount += 1;
    return route.fulfill({ status: 500 });
  });
  await page.goto('/ai/');
  await submitPrompt(page, '   \n  ');

  await expect(page.locator('#submit-status')).toContainText('1〜2,000');
  await expect(page.getByLabel('質問本文')).toHaveValue('   \n  ');
  expect(postCount).toBe(0);
});

test('UI20 rejects 2,001 Unicode code points without sending a POST', async ({
  page,
}) => {
  await mockHistory(page);
  let postCount = 0;
  await page.route('**/api/ai/ask', (route) => {
    postCount += 1;
    return route.fulfill({ status: 500 });
  });
  await page.goto('/ai/');
  await submitPrompt(page, '😀'.repeat(2_001));

  await expect(page.locator('#submit-status')).toContainText('1〜2,000');
  expect(postCount).toBe(0);
});

test('UI21 shows the waiting state and disables the send button in flight', async ({
  page,
}) => {
  await mockHistory(page);
  let finishAsk = (): void => {};
  const waiting = new Promise<void>((resolve) => {
    finishAsk = resolve;
  });
  await page.route('**/api/ai/ask', async (route) => {
    await waiting;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        item: item(42, '質問本文'),
      }),
    });
  });
  await page.goto('/ai/');
  await submitPrompt(page);

  await expect(page.locator('#submit-status')).toHaveText(
    '回答を生成しています',
  );
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeDisabled();
  finishAsk();
  await expect(page.locator('#answer-panel')).toBeVisible();
});

test('UI22 ignores repeated submit events while one POST is in flight', async ({
  page,
}) => {
  await mockHistory(page);
  let postCount = 0;
  let finishAsk = (): void => {};
  const waiting = new Promise<void>((resolve) => {
    finishAsk = resolve;
  });
  await page.route('**/api/ai/ask', async (route) => {
    postCount += 1;
    await waiting;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        item: item(42, '質問本文'),
      }),
    });
  });
  await page.goto('/ai/');
  await submitPrompt(page);
  await page
    .locator('#question-form')
    .evaluate((form) =>
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      ),
    );

  expect(postCount).toBe(1);
  finishAsk();
  await expect(page.locator('#answer-panel')).toBeVisible();
});

test('UI23 maps AI_UNAVAILABLE to a fixed message and keeps the prompt', async ({
  page,
}) => {
  await mockHistory(page);
  await page.route('**/api/ai/ask', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'AI_UNAVAILABLE', message: 'private AI details' },
      }),
    }),
  );
  await page.goto('/ai/');
  await submitPrompt(page, '回答してください');

  await expect(page.locator('#submit-status')).toContainText(
    'AIから回答を取得できませんでした',
  );
  await expect(page.getByLabel('質問本文')).toHaveValue('回答してください');
  await expect(page.getByText('private AI details')).toHaveCount(0);
});

test('UI24 maps DB_UNAVAILABLE to a fixed message and keeps the prompt', async ({
  page,
}) => {
  await mockHistory(page);
  await page.route('**/api/ai/ask', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'DB_UNAVAILABLE', message: 'private db details' },
      }),
    }),
  );
  await page.goto('/ai/');
  await submitPrompt(page, '保存を確認してください');

  await expect(page.locator('#submit-status')).toContainText(
    'データベースを利用できません',
  );
  await expect(page.getByLabel('質問本文')).toHaveValue(
    '保存を確認してください',
  );
  await expect(page.getByText('private db details')).toHaveCount(0);
});

test('UI25 shows the disabled state for DEMO_DISABLED', async ({ page }) => {
  await mockHistory(page);
  await page.route('**/api/ai/ask', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'DEMO_DISABLED', message: 'private details' },
      }),
    }),
  );
  await page.goto('/ai/');
  await submitPrompt(page);

  await expect(page.locator('#submit-status')).toHaveText(
    'AI質問機能は現在利用できません。',
  );
  await expect(page.getByLabel('質問本文')).toHaveValue('質問本文');
});

test('UI26 recovers from a network failure without clearing the prompt', async ({
  page,
}) => {
  await mockHistory(page);
  let postCount = 0;
  await page.route('**/api/ai/ask', (route) => {
    postCount += 1;
    return route.abort();
  });
  await page.goto('/ai/');
  await submitPrompt(page, 'ネットワーク質問');

  await expect(page.locator('#submit-status')).toContainText(
    '通信結果を確認できませんでした',
  );
  await expect(page.getByLabel('質問本文')).toHaveValue('ネットワーク質問');
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeEnabled();
  expect(postCount).toBe(1);
});

test('UI27 handles the 45-second timeout without automatic retry', async ({
  page,
}) => {
  await page.clock.install();
  await mockHistory(page);
  let postCount = 0;
  let releaseAsk = (): void => {};
  const waiting = new Promise<void>((resolve) => {
    releaseAsk = resolve;
  });
  await page.route('**/api/ai/ask', async (route) => {
    postCount += 1;
    await waiting;
    try {
      await route.fulfill({ status: 201, body: '{}' });
    } catch {
      // The browser has already aborted the timed-out request.
    }
  });
  await page.goto('/ai/');
  await submitPrompt(page, '時間がかかる質問');
  await page.clock.fastForward(45_000);

  await expect(page.locator('#submit-status')).toContainText(
    '保存結果は不明です',
  );
  await expect(page.locator('#submit-status')).toContainText(
    '履歴を確認してください',
  );
  await expect(page.getByLabel('質問本文')).toHaveValue('時間がかかる質問');
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeEnabled();
  expect(postCount).toBe(1);
  releaseAsk();
});

test('UI28 handles invalid JSON with a safe fixed message', async ({
  page,
}) => {
  await mockHistory(page);
  await page.route('**/api/ai/ask', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: '{broken-json',
    }),
  );
  await page.goto('/ai/');
  await submitPrompt(page);

  await expect(page.locator('#submit-status')).toContainText(
    '通信結果を確認できませんでした',
  );
  await expect(page.getByLabel('質問本文')).toHaveValue('質問本文');
});

test('UI29 rejects a malformed 201 payload without showing an answer', async ({
  page,
}) => {
  await mockHistory(page);
  let postCount = 0;
  await page.route('**/api/ai/ask', (route) => {
    postCount += 1;
    const invalidItems = [
      { id: 0, prompt: '質問本文', response: '回答', createdAt },
      { id: 42, prompt: '質問本文', response: '  ', createdAt },
      { id: 42, prompt: '質問本文', response: '回答', createdAt: 'invalid' },
    ];
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        item: invalidItems[postCount - 1],
      }),
    });
  });
  await page.goto('/ai/');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt === 0) {
      await submitPrompt(page);
    } else {
      await page.getByRole('button', { name: '質問を送信' }).click();
    }

    await expect(page.locator('#answer-panel')).toBeHidden();
    await expect(page.locator('#submit-status')).toContainText(
      '応答を確認できませんでした',
    );
    await expect(page.getByLabel('質問本文')).toHaveValue('質問本文');
  }
  expect(postCount).toBe(3);
});

test('UI30 displays HTML-like prompt and answer strings only as text', async ({
  page,
}) => {
  const prompt = '<img src=x onerror="window.__xss = true">質問';
  const response = '<svg onload="window.__xss = true">回答</svg>';
  await mockHistory(page, () => [item(42, prompt, response)]);
  await page.route('**/api/ai/ask', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, item: item(42, prompt, response) }),
    }),
  );
  await page.goto('/ai/');
  await submitPrompt(page, prompt);

  await expect(page.locator('#answer-prompt')).toHaveText(prompt);
  await expect(page.locator('#answer-response')).toHaveText(response);
  await expect(
    page.locator('#answer-panel img, #answer-panel svg'),
  ).toHaveCount(0);
  await expect(
    page.locator('#history-list img, #history-list svg'),
  ).toHaveCount(0);
  expect(await page.evaluate('window.__xss')).toBeUndefined();
});

test('UI31 retains old history and adds the accepted question without conflict', async ({
  page,
}) => {
  let historyRequestCount = 0;
  await mockHistory(page, () => {
    historyRequestCount += 1;
    return historyRequestCount === 1
      ? [item(5, '以前の質問', '以前の回答')]
      : [
          item(42, '新しい質問', '新しい回答'),
          item(5, '以前の質問', '以前の回答'),
        ];
  });
  await page.route('**/api/ai/ask', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        item: item(42, '新しい質問', '新しい回答'),
      }),
    }),
  );
  await page.goto('/ai/');
  await expect(page.getByText('以前の質問')).toBeVisible();
  await submitPrompt(page, '新しい質問');

  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('listitem').first()).toContainText('新しい質問');
  await expect(page.getByText('以前の質問')).toBeVisible();
  await expect(page.locator('#answer-response')).toHaveText('新しい回答');
});

test('UI32 keeps the form usable for a deliberate retry after an error', async ({
  page,
}) => {
  await mockHistory(page);
  let postCount = 0;
  await page.route('**/api/ai/ask', (route) => {
    postCount += 1;
    if (postCount === 1) {
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'AI_UNAVAILABLE', message: 'private detail' },
        }),
      });
    }
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        item: item(42, '再操作した質問', '再操作後の回答'),
      }),
    });
  });
  await page.goto('/ai/');
  await submitPrompt(page, '再操作した質問');
  await expect(page.locator('#submit-status')).toContainText(
    'AIから回答を取得できませんでした',
  );

  await expect(page.getByRole('button', { name: '質問を送信' })).toBeEnabled();
  await page.getByRole('button', { name: '質問を送信' }).click();
  await expect(page.locator('#answer-response')).toHaveText('再操作後の回答');
  expect(postCount).toBe(2);
});

test('UT02 keeps a saved answer and restores the form when follow-up history times out', async ({
  page,
}) => {
  await page.clock.install();
  let historyRequestCount = 0;
  let releaseHistory = (): void => {};
  const pendingHistory = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  await page.route('**/api/ai/history', async (route) => {
    historyRequestCount += 1;
    if (historyRequestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] }),
      });
      return;
    }

    await pendingHistory;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [item(42, '質問本文')] }),
      });
    } catch {
      // The browser has already aborted the expired history request.
    }
  });
  await mockAskSuccess(page);
  await page.goto('/ai/');
  await submitPrompt(page);

  await expect(page.locator('#answer-response')).toHaveText('保存されたAI回答');
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeDisabled();
  await page.clock.fastForward(15_000);

  await expect(page.locator('#answer-response')).toHaveText('保存されたAI回答');
  await expect(page.locator('#submit-status')).toHaveText(
    '回答は保存されましたが、履歴の更新に失敗しました。',
  );
  await expect(page.locator('#history-content')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByRole('button', { name: '質問を送信' })).toBeEnabled();
  await expect(page.getByLabel('質問本文')).toHaveValue('');
  releaseHistory();
});
