import { expect, test } from '@playwright/test';
import { PEOPLE, moveStatus, openTicket, reportAsGuest, runJobs, signIn, signOut } from './helpers';

/**
 * §52 of the brief — the MVP acceptance scenario, end to end through the real UI.
 * If this fails, the MVP is not complete.
 */
test.describe.configure({ mode: 'serial' });

test('a guest report is triaged, investigated, fixed, verified and reported on', async ({
  page,
}) => {
  // Steps 1–4: a customer with no account reports a problem and gets a reference.
  const key = await reportAsGuest(page, { portal: 'Guardian Portal', attach: true });
  await expect(page.getByRole('heading', { name: /we have your report/i })).toBeVisible();
  await expect(page.getByText(key)).toBeVisible();

  // The acknowledgement email is queued, not sent inline, so draining the queue delivers it.
  await runJobs(page);

  // The guest can open their own ticket from the one-time link on the confirmation page.
  await page.getByRole('link', { name: 'Open your ticket' }).click();
  await page.waitForURL(new RegExp(`/tickets/${key}`));
  await expect(page.getByRole('heading', { name: /cannot make payment/i })).toBeVisible();
  await expect(page.getByText('New')).toBeVisible();

  // Step 5–6: the ticket is in the support queue and support triages it.
  await signIn(page, PEOPLE.support);
  await page.goto('/queue?tab=untriaged');
  await expect(page.getByRole('link', { name: new RegExp(key) })).toBeVisible();

  await openTicket(page, key);
  await page.getByLabel('Category').selectOption({ label: 'Payment' });
  await page.getByLabel('Severity').selectOption({ value: 'S2_HIGH' });
  await page.getByLabel('Priority').selectOption({ value: 'P1_URGENT' });
  await page.getByRole('button', { name: 'Save triage' }).click();
  await expect(page.getByText('S2 High')).toBeVisible();
  await expect(page.getByText('P1 Urgent')).toBeVisible();

  // Step 7: support and QA are assigned; QA is notified.
  await page
    .locator('form:has(select#assign-SUPPORT)')
    .getByRole('button', { name: 'Set' })
    .click();
  await expect(page.getByLabel('Support owner')).toHaveValue(/.+/);

  await page.getByLabel('QA owner').selectOption({ label: 'Qadri Quality' });
  await page.locator('form:has(select#assign-QA)').getByRole('button', { name: 'Set' }).click();
  await signOut(page);

  await signIn(page, PEOPLE.qa);
  await page.goto('/notifications');
  await expect(page.getByText(new RegExp(key))).toBeVisible();

  // Step 8: QA reproduces and records internal findings.
  await openTicket(page, key);
  await page.getByRole('radio', { name: 'QA note' }).click();
  await page
    .getByLabel('Internal note')
    .fill('Reproduced on staging with a guardian account. Gateway returns 502.');
  await page.getByRole('button', { name: 'Add internal note' }).click();
  await expect(page.getByText(/Reproduced on staging/)).toBeVisible();

  // Step 9: the developer is assigned and notified.
  await page.getByLabel('Developer').selectOption({ label: 'Michael Dev' });
  await page
    .locator('form:has(select#assign-ENGINEERING)')
    .getByRole('button', { name: 'Set' })
    .click();
  await expect(page.getByText(/Michael Dev/).first()).toBeVisible();
  await signOut(page);

  // Step 10–11: the developer investigates and marks the fix ready for QA.
  await signIn(page, PEOPLE.developer);
  await page.goto('/notifications');
  await expect(page.getByText(new RegExp(key))).toBeVisible();

  await openTicket(page, key);
  await page.getByRole('radio', { name: 'Developer note' }).click();
  await page.getByLabel('Internal note').fill('Fix implemented. Ready for QA.');
  await page.getByRole('button', { name: 'Add internal note' }).click();

  await moveStatus(page, 'In progress');
  await moveStatus(page, 'Ready for QA');
  await expect(page.getByText('Ready for QA').first()).toBeVisible();
  await signOut(page);

  // Step 12–13: QA verifies and resolves.
  await signIn(page, PEOPLE.qa);
  await openTicket(page, key);
  await moveStatus(page, 'QA verification');
  await moveStatus(page, 'Resolved', 'Gateway configuration corrected and payment now completes.');
  await expect(page.getByText('Resolved').first()).toBeVisible();

  // Step 14: the reporter is emailed automatically.
  await runJobs(page);

  // Step 15: the whole history is visible to authorised staff.
  await openTicket(page, key);
  const activity = page.locator('ol');
  await expect(activity.getByText(/reported this issue/)).toBeVisible();
  await expect(activity.getByText(/changed status from/).first()).toBeVisible();
  await expect(activity.getByText(/assigned Michael Dev as developer/)).toBeVisible();
  await signOut(page);

  // Step 16: management dashboards reflect the ticket.
  await signIn(page, PEOPLE.hod);
  await page.goto('/reports?range=30d');
  await expect(page.getByText('Tickets created')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tickets by portal' })).toBeVisible();
  await expect(page.getByText('Guardian Portal').first()).toBeVisible();
  await expect(page.getByText('SLA compliance')).toBeVisible();
});

test('a registered user reports an issue and follows it from their dashboard', async ({ page }) => {
  await signIn(page, PEOPLE.user);

  await page.goto('/report');
  await expect(page.getByText(/Signed in as/)).toBeVisible();
  await page.getByLabel('Which portal or product?').selectOption({ label: 'Customer Portal' });
  await page.getByLabel('What is the problem?').fill('My statement will not download');
  await page
    .getByLabel('Tell us what happened')
    .fill('Clicking download spins forever and then fails.');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await page.waitForURL(/\/report\/submitted/);

  const key = (await page.locator('p.font-mono').first().innerText()).trim();

  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: new RegExp(key) })).toBeVisible();

  await page.goto(`/tickets/${key}`);
  await page.getByLabel('Your comment').fill('This also happens on my phone.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('This also happens on my phone.')).toBeVisible();
});

test('a resolved ticket can be confirmed by the reporter, which closes it', async ({ page }) => {
  const key = await reportAsGuest(page, { title: 'Login button does nothing' });
  // Keep the guest's secure link; it is unused so far, so it still opens the ticket.
  const guestLink = await page.getByRole('link', { name: 'Open your ticket' }).getAttribute('href');

  await signIn(page, PEOPLE.support);
  await openTicket(page, key);
  await moveStatus(page, 'Triage');
  await moveStatus(page, 'In progress');
  await moveStatus(page, 'Resolved', 'Cache cleared, login works again.');
  await signOut(page);
  await runJobs(page);

  // The reporter returns and is asked, in plain language, whether the issue is sorted.
  await page.context().clearCookies();
  await page.goto(guestLink!);
  await page.waitForURL(new RegExp(`/tickets/${key}`));
  await expect(page.getByRole('heading', { name: /Is this sorted\?/ })).toBeVisible();
  await expect(page.getByText('Cache cleared, login works again.')).toBeVisible();

  await page.getByRole('button', { name: 'Yes, it is working' }).click();
  await expect(page.getByRole('heading', { name: /This ticket is closed/ })).toBeVisible();
});

test('a reporter who is still affected can reopen the ticket', async ({ page }) => {
  const key = await reportAsGuest(page, { title: 'Statement totals are wrong' });
  const guestLink = await page.getByRole('link', { name: 'Open your ticket' }).getAttribute('href');

  await signIn(page, PEOPLE.support);
  await openTicket(page, key);
  await moveStatus(page, 'Triage');
  await moveStatus(page, 'In progress');
  await moveStatus(page, 'Resolved', 'Totals recalculated.');
  await signOut(page);

  await page.context().clearCookies();
  await page.goto(guestLink!);
  await page.waitForURL(new RegExp(`/tickets/${key}`));
  await page.getByRole('button', { name: 'No, it is still happening' }).click();

  // The ticket comes back to the team, and the history records who reopened it.
  await expect(page.getByText('Reopened').first()).toBeVisible();

  await signIn(page, PEOPLE.support);
  await openTicket(page, key);
  await expect(page.getByText(/changed status from Resolved to Reopened/i)).toBeVisible();
});
