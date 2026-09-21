import { expect, test } from '@playwright/test';

/**
 * §38 of the brief — guest reporting must work well on a phone, because that is where most
 * reports come from. Runs on the Pixel 7 project.
 */
test('a guest can report an issue from a phone without horizontal scrolling', async ({ page }) => {
  await page.goto('/report');

  const viewportWidth = page.viewportSize()!.width;
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth + 1);

  await page.getByLabel('Your name').fill('Mobile Reporter');
  await page.getByLabel(/Email address/).fill('mobile@example.com');
  await page.getByLabel('Which portal or product?').selectOption({ label: 'Guardian Portal' });
  await page.getByLabel('What is the problem?').fill('App payment fails on mobile');
  await page
    .getByLabel('Tell us what happened')
    .fill('Paying from my phone shows an error every time.');

  const submit = page.getByRole('button', { name: 'Submit report' });
  const box = await submit.boundingBox();
  expect(box!.height, 'touch targets need to be at least 44px tall').toBeGreaterThanOrEqual(40);

  await submit.click();
  await page.waitForURL(/\/report\/submitted/);
  await expect(page.getByRole('heading', { name: /we have your report/i })).toBeVisible();
});

test('the landing page is usable at phone width', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Report an issue' }).first()).toBeVisible();

  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});
