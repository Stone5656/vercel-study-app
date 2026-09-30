import { expect, test } from '@playwright/test';

test('displays the home page', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Home');
  await expect(
    page.getByRole('heading', {
      name: 'My Express Site',
    }),
  ).toBeVisible();
});
