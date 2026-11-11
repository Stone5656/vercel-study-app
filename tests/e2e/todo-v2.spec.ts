import { expect, test } from '@playwright/test';

test('TODO V2で優先度と絞り込みを使える', async ({ page }) => {
  const title = `v2-e2e-${Date.now()}`;

  await page.goto('/todo-v2');
  await page.getByLabel('新しいTODO').fill(title);
  await page.locator('#todo-v2-priority').selectOption('high');
  await page.getByRole('button', { name: '登録' }).click();

  const todo = page.locator('#todo-v2-list li').filter({ hasText: title });
  await expect(todo).toBeVisible();
  await expect(todo.getByLabel(`${title}の優先度`)).toHaveValue('high');

  await page.locator('#todo-v2-filter-priority').selectOption('high');
  await page.locator('#todo-v2-filter-completed').selectOption('false');
  await expect(todo).toBeVisible();

  const checkbox = todo.getByRole('checkbox', {
    name: `${title}を完了にする`,
  });
  await checkbox.check();
  await page.locator('#todo-v2-filter-completed').selectOption('true');
  await expect(todo).toBeVisible();

  await page.locator('#todo-v2-filter-reset').click();
  const priority = todo.getByLabel(`${title}の優先度`);
  await priority.selectOption('low');
  await page.locator('#todo-v2-filter-priority').selectOption('low');
  await expect(todo).toBeVisible();

  await todo.getByRole('button', { name: '削除' }).click();
  await expect(todo).toHaveCount(0);
});
