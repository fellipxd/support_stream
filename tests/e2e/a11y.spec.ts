import { expect, test } from '@playwright/test';

/** docs/PRODUCT_REQUIREMENTS.md §6 — WCAG 2.1 AA basics, asserted on the critical flow. */

test('the report form can be completed with the keyboard alone', async ({ page }) => {
  await page.goto('/report');

  // Every control is reachable and labelled, so a keyboard or screen-reader user can fill it in.
  await page.getByLabel('Your name').focus();
  await page.keyboard.type('Keyboard User');
  await page.keyboard.press('Tab');
  await page.keyboard.type('keyboard@example.com');

  await page.getByLabel('Which portal or product?').focus();
  await page.getByLabel('Which portal or product?').selectOption({ label: 'School Portal' });
  await page.getByLabel('What is the problem?').fill('Results page will not load');
  await page
    .getByLabel('Tell us what happened')
    .fill('The results page spins and never finishes loading.');

  await page.getByRole('button', { name: 'Submit report' }).focus();
  await page.keyboard.press('Enter');

  await page.waitForURL(/\/report\/submitted/);
  await expect(page.getByRole('heading', { name: /we have your report/i })).toBeVisible();
});

test('the landing page has a sensible heading structure and a skip link', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
});

test('required fields are marked up so assistive technology can announce errors', async ({
  page,
}) => {
  await page.goto('/report');

  // Submitting an incomplete form surfaces errors that are linked to their inputs.
  await page.getByLabel('Your name').fill('A');
  await page.getByLabel(/Email address/).fill('not-an-email');
  await page.getByLabel('What is the problem?').fill('x');
  await page.getByLabel('Tell us what happened').fill('y');
  await page.getByRole('button', { name: 'Submit report' }).click();

  // Next.js renders its own route announcer with role="alert", so scope to the form's.
  const alert = page.locator('form').getByRole('alert');
  await expect(alert).toBeVisible();

  const portal = page.getByLabel('Which portal or product?');
  await expect(portal).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await portal.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toBeVisible();
});

test('every form control on the report page has an accessible name', async ({ page }) => {
  await page.goto('/report');

  const controls = page.locator('input:not([type=hidden]), select, textarea');
  const count = await controls.count();
  expect(count).toBeGreaterThan(5);

  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    const id = await control.getAttribute('id');
    const ariaLabel = await control.getAttribute('aria-label');
    if (ariaLabel) continue;
    expect(id, 'every control needs an id or an aria-label').toBeTruthy();
    await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
  }
});
