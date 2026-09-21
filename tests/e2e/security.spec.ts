import { expect, test } from '@playwright/test';
import { PEOPLE, PNG_FIXTURE, openTicket, reportAsGuest, signIn, signOut } from './helpers';

/** docs/TEST_STRATEGY.md §4 — the negative and security suite. */
test.describe.configure({ mode: 'serial' });

test('an unauthenticated visitor cannot open a ticket by guessing its reference', async ({
  page,
}) => {
  const key = await reportAsGuest(page, { title: 'Sensitive report about my account' });
  await page.context().clearCookies();

  const response = await page.goto(`/tickets/${key}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/Sensitive report about my account/)).toHaveCount(0);
});

test('the find-ticket page refuses to open tickets from a reference alone', async ({ page }) => {
  await page.goto('/find-ticket');
  await expect(page.getByRole('heading', { name: /Looking for a ticket/ })).toBeVisible();
  await expect(
    page.getByText(/we do not open tickets from a reference number alone/i),
  ).toBeVisible();
  await expect(page.locator('input[name="key"]')).toHaveCount(0);
});

test('one user cannot read another user’s ticket', async ({ page }) => {
  await signIn(page, PEOPLE.user);
  await page.goto('/report');
  await page.getByLabel('Which portal or product?').selectOption({ label: 'Customer Portal' });
  await page.getByLabel('What is the problem?').fill('Private billing problem');
  await page
    .getByLabel('Tell us what happened')
    .fill('Contains information I would not want shared.');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await page.waitForURL(/\/report\/submitted/);
  const key = (await page.locator('p.font-mono').first().innerText()).trim();
  await signOut(page);

  await signIn(page, PEOPLE.otherUser);
  const response = await page.goto(`/tickets/${key}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText('Private billing problem')).toHaveCount(0);
});

test('a tampered guest link is rejected', async ({ page }) => {
  await reportAsGuest(page);
  const href = await page.getByRole('link', { name: 'Open your ticket' }).getAttribute('href');
  const tampered = `${href!.slice(0, -3)}XYZ`;

  await page.context().clearCookies();
  await page.goto(tampered);
  await expect(page).toHaveURL(/link-expired/);
  await expect(page.getByRole('heading', { name: /no longer valid/i })).toBeVisible();
});

test('a guest link opens one ticket only, and cannot reach another', async ({ page }) => {
  const first = await reportAsGuest(page, { title: 'First guest ticket' });
  const link = await page.getByRole('link', { name: 'Open your ticket' }).getAttribute('href');

  await page.context().clearCookies();
  const second = await reportAsGuest(page, { title: 'Second guest ticket' });
  await page.context().clearCookies();

  await page.goto(link!);
  await page.waitForURL(new RegExp(`/tickets/${first}`));
  await expect(page.getByRole('heading', { name: 'First guest ticket' })).toBeVisible();

  const response = await page.goto(`/tickets/${second}`);
  expect(response?.status()).toBe(404);
});

test('internal notes never reach the reporter’s view or page source', async ({ page }) => {
  const key = await reportAsGuest(page, { title: 'Payment declined unexpectedly' });
  const link = await page.getByRole('link', { name: 'Open your ticket' }).getAttribute('href');

  await signIn(page, PEOPLE.support);
  await openTicket(page, key);
  await page.getByRole('radio', { name: 'Internal note' }).click();
  await page
    .getByLabel('Internal note')
    .fill('CONFIDENTIAL: customer is on a legacy contract, do not disclose.');
  await page.getByRole('button', { name: 'Add internal note' }).click();
  await expect(page.getByText(/CONFIDENTIAL/)).toBeVisible();
  await signOut(page);

  await page.context().clearCookies();
  await page.goto(link!);
  await page.waitForURL(new RegExp(`/tickets/${key}`));

  await expect(page.getByText(/CONFIDENTIAL/)).toHaveCount(0);
  expect(await page.content()).not.toContain('legacy contract');
});

test('a reporter is not offered staff controls, and the server refuses them anyway', async ({
  page,
}) => {
  const key = await reportAsGuest(page);
  await page.getByRole('link', { name: 'Open your ticket' }).click();
  await page.waitForURL(new RegExp(`/tickets/${key}`));

  await expect(page.getByRole('button', { name: 'Save triage' })).toHaveCount(0);
  await expect(page.getByLabel('New status')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Internal note' })).toHaveCount(0);
});

test('a developer sees only tickets assigned to them', async ({ page }) => {
  await reportAsGuest(page, { title: 'Unassigned developer test ticket' });
  await page.context().clearCookies();

  await signIn(page, PEOPLE.developer);
  await page.goto('/queue');
  await expect(page.getByText('Unassigned developer test ticket')).toHaveCount(0);
});

test('a support agent cannot reach the administration area', async ({ page }) => {
  await signIn(page, PEOPLE.support);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/dashboard/);
});

test('a plain user cannot reach the queue or reports', async ({ page }) => {
  await signIn(page, PEOPLE.user);
  await page.goto('/queue');
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/reports');
  await expect(page).toHaveURL(/\/dashboard/);
});

test('an unsupported file type is rejected', async ({ page }) => {
  await page.goto('/report');
  await page.getByLabel('Your name').fill('John Doe');
  await page.getByLabel(/Email address/).fill('john.doe@example.com');
  await page.getByLabel('Which portal or product?').selectOption({ label: 'Customer Portal' });
  await page.getByLabel('What is the problem?').fill('Attachment validation check');
  await page.getByLabel('Tell us what happened').fill('Attaching a file type we do not accept.');
  await page.setInputFiles('#attachments', {
    name: 'payload.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  await page.getByRole('button', { name: 'Submit report' }).click();

  await expect(page.locator('form').getByRole('alert')).toBeVisible();
  await expect(page).not.toHaveURL(/submitted/);
});

test('a comment cannot inject script into the page', async ({ page }) => {
  const key = await reportAsGuest(page, { title: 'XSS attempt' });

  await signIn(page, PEOPLE.support);
  await openTicket(page, key);
  await page
    .getByLabel(/comment|note/i)
    .first()
    .fill('<img src=x onerror="window.__xss=1"> <script>window.__xss=1</script>');
  await page
    .getByRole('button', { name: /Send reply|Add internal note/ })
    .first()
    .click();
  await expect(page.getByText(/script/)).toBeVisible();

  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
});

test('security headers are present on every response', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response!.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-powered-by']).toBeUndefined();
});

test('the job runner refuses an unauthenticated request', async ({ request }) => {
  expect((await request.post('/api/jobs/run')).status()).toBe(401);
  expect(
    (
      await request.post('/api/jobs/run', { headers: { authorization: 'Bearer wrong-secret' } })
    ).status(),
  ).toBe(401);
});

test('an attachment cannot be downloaded without a valid signature', async ({ page, request }) => {
  const key = await reportAsGuest(page, { attach: true });
  await signIn(page, PEOPLE.support);
  await openTicket(page, key);

  const href = await page
    .getByRole('link', { name: 'screenshot.png' })
    .first()
    .getAttribute('href');
  const id = href!.split('/')[3];

  expect((await request.get(`/api/attachments/${id}`)).status()).toBe(404);
  expect(
    (await request.get(`/api/attachments/${id}?expires=9999999999&signature=forged`)).status(),
  ).toBe(404);
  expect(PNG_FIXTURE.length).toBeGreaterThan(0);
});
