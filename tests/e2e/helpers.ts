import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Passw0rd!demo';

export const PEOPLE = {
  support: 'support@example.com',
  qa: 'qa@example.com',
  developer: 'dev@example.com',
  admin: 'admin@example.com',
  hod: 'hod@example.com',
  user: 'user@example.com',
  otherUser: 'user2@example.com',
};

export async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/');
}

/** Submits the public report form and returns the ticket key from the confirmation page. */
export async function reportAsGuest(
  page: Page,
  options: { portal?: string; title?: string; description?: string; attach?: boolean } = {},
): Promise<string> {
  await page.goto('/report');
  await page.getByLabel('Your name').fill('John Doe');
  await page.getByLabel(/Email address/).fill('john.doe@example.com');
  await page
    .getByLabel('Which portal or product?')
    .selectOption({ label: options.portal ?? 'Guardian Portal' });
  await page
    .getByLabel('What is the problem?')
    .fill(options.title ?? 'I cannot make payment for my ward');
  await page
    .getByLabel('Tell us what happened')
    .fill(options.description ?? 'When I click pay nothing happens and the page shows an error.');

  if (options.attach) {
    await page.setInputFiles('#attachments', {
      name: 'screenshot.png',
      mimeType: 'image/png',
      buffer: PNG_FIXTURE,
    });
  }

  await page.getByRole('button', { name: 'Submit report' }).click();
  await page.waitForURL(/\/report\/submitted/);

  const key = await page.locator('p.font-mono').first().innerText();
  expect(key).toMatch(/^[A-Z]{3}-\d{6}$/);
  return key.trim();
}

/** A real 1×1 PNG, so the magic-byte check passes. */
export const PNG_FIXTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Drains the job queue so queued emails are recorded before the suite asserts on them. */
export async function runJobs(page: Page) {
  const response = await page.request.post('/api/jobs/run', {
    headers: { authorization: 'Bearer e2e-job-runner-secret' },
  });
  expect(response.ok()).toBeTruthy();
}

export async function openTicket(page: Page, key: string) {
  await page.goto(`/tickets/${key}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

export async function moveStatus(page: Page, status: string, note?: string) {
  await page.getByLabel('New status').selectOption({ label: status });
  if (note) await page.getByLabel(/Note|Resolution note/).fill(note);
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByRole('button', { name: 'Update status' })).toBeEnabled();
}
