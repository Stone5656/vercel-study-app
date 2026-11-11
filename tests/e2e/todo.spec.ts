import { expect, test } from '@playwright/test';

test('TODOを登録・完了・削除できる', async ({ page }) => {
  const title = `v1-e2e-${Date.now()}`;

  await page.goto('/todo');
  await page.getByLabel('新しいTODO').fill(title);
  await page.getByRole('button', { name: '登録' }).click();

  const todo = page.locator('#todo-list li').filter({ hasText: title });
  await expect(todo).toBeVisible();

  const checkbox = todo.getByRole('checkbox', {
    name: `${title}を完了にする`,
  });
  await checkbox.check();
  await expect(checkbox).toBeChecked();

  await todo.getByRole('button', { name: '削除' }).click();
  await expect(todo).toHaveCount(0);
});
