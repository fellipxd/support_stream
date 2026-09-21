import { beforeEach, describe, expect, it } from 'vitest';
import { createTicket, transitionTicket } from '@/server/tickets/service';
import { runDueJobs } from '@/server/jobs/worker';
import { claim, enqueue, fail, queueDepth, reclaimStale } from '@/server/jobs/queue';
import { setMailer, type OutgoingMail } from '@/server/notifications/mailer';
import { prisma, makeWorld, reportInput, resetDatabase, SYSTEM } from '../factories';

/** docs/NOTIFICATION_ARCHITECTURE.md §4 — delivery, retries and the failure path. */

let world: Awaited<ReturnType<typeof makeWorld>>;
let sent: OutgoingMail[];

beforeEach(async () => {
  await resetDatabase();
  world = await makeWorld();
  sent = [];
  setMailer({
    async send(mail) {
      sent.push(mail);
      return { messageId: `test-${sent.length}` };
    },
  });
});

describe('email delivery through the queue', () => {
  it('sends the acknowledgement when the worker runs', async () => {
    const { key } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const result = await runDueJobs();

    expect(result.processed).toBeGreaterThan(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('guest@example.com');
    expect(sent[0]!.subject).toContain(key);
    expect(sent[0]!.html).toContain(key);
    expect(sent[0]!.text).toContain(key);
  });

  it('gives a guest a working secure link, not a bare ticket id', async () => {
    await createTicket(SYSTEM, reportInput(world.portal.id));
    await runDueJobs();

    const link = /https?:\/\/[^\s"]+\/t\/([A-Za-z0-9_-]+)/.exec(sent[0]!.html);
    expect(link).not.toBeNull();
    const { hashToken } = await import('@/server/auth/tokens');
    const token = await prisma.guestAccessToken.findUnique({
      where: { tokenHash: hashToken(link![1]!) },
    });
    expect(token).not.toBeNull();
  });

  it('records the delivery', async () => {
    await createTicket(SYSTEM, reportInput(world.portal.id));
    await runDueJobs();

    const delivery = await prisma.emailDelivery.findFirstOrThrow();
    expect(delivery).toMatchObject({ status: 'SENT', template: 'ticket_received', attempts: 1 });
    expect(delivery.providerMessageId).toBe('test-1');
  });

  it('does not store the email body, which contains an access link', async () => {
    await createTicket(SYSTEM, reportInput(world.portal.id));
    await runDueJobs();
    const delivery = await prisma.emailDelivery.findFirstOrThrow();
    expect(JSON.stringify(delivery)).not.toContain('/t/');
  });

  it('retries with backoff when the mail server fails', async () => {
    setMailer({
      async send() {
        throw new Error('smtp unavailable');
      },
    });
    await createTicket(SYSTEM, reportInput(world.portal.id));
    const result = await runDueJobs();

    expect(result.failed).toBe(1);
    const job = await prisma.job.findFirstOrThrow({ where: { type: 'email.send' } });
    expect(job.status).toBe('PENDING');
    expect(job.attempts).toBe(1);
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now()); // scheduled for later, not hammered
    expect(job.lastError).toContain('smtp unavailable');

    const delivery = await prisma.emailDelivery.findFirstOrThrow();
    expect(delivery.status).toBe('FAILED');
  });

  it('dead-letters a job once its attempts are exhausted', async () => {
    const jobId = await enqueue(
      prisma,
      'email.send',
      { template: 'ticket_received', to: 'a@b.com', data: {} },
      { maxAttempts: 1 },
    );
    const claimed = await claim('worker-1', 5);
    const job = claimed.find((j) => j.id === jobId)!;
    await fail(job, new Error('permanent failure'));

    const stored = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(stored.status).toBe('DEAD');
    expect((await queueDepth()).dead).toBe(1);
  });

  it('suppresses sending to an address on the suppression list', async () => {
    await prisma.emailDelivery.create({
      data: {
        template: 'ticket_received',
        toAddress: 'guest@example.com',
        subject: 'x',
        status: 'SUPPRESSED',
      },
    });
    await createTicket(SYSTEM, reportInput(world.portal.id));
    await runDueJobs();
    expect(sent).toHaveLength(0);
  });

  it('never delivers an internal note to a reporter', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const { addComment } = await import('@/server/tickets/service');
    await addComment(world.support, {
      ticketId: id,
      body: 'INTERNAL: do not disclose',
      visibility: 'INTERNAL',
    });
    await runDueJobs();

    for (const mail of sent) {
      expect(mail.html).not.toContain('do not disclose');
      expect(mail.text).not.toContain('do not disclose');
    }
  });

  it('sends the resolution email with the note the reporter should see', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    await runDueJobs();
    sent.length = 0;

    await transitionTicket(world.support, { ticketId: id, to: 'TRIAGE' });
    await transitionTicket(world.support, { ticketId: id, to: 'IN_PROGRESS' });
    await transitionTicket(world.support, {
      ticketId: id,
      to: 'RESOLVED',
      note: 'Payment gateway configuration corrected.',
    });
    await runDueJobs();

    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toContain('Resolved');
    expect(sent[0]!.html).toContain('Payment gateway configuration corrected.');
  });
});

describe('the queue itself', () => {
  it('claims a job once, so two workers never duplicate work', async () => {
    await enqueue(prisma, 'maintenance.prune', {});
    const [first, second] = await Promise.all([claim('worker-a', 10), claim('worker-b', 10)]);
    expect(first.length + second.length).toBe(1);
  });

  it('does not claim a job scheduled for the future', async () => {
    await enqueue(prisma, 'maintenance.prune', {}, { runAt: new Date(Date.now() + 3_600_000) });
    expect(await claim('worker-a', 10)).toHaveLength(0);
  });

  it('recovers jobs abandoned by a crashed worker', async () => {
    const jobId = await enqueue(prisma, 'maintenance.prune', {});
    await claim('worker-dead', 10);
    await prisma.job.update({
      where: { id: jobId },
      data: { lockedAt: new Date(Date.now() - 20 * 60_000) },
    });

    expect(await reclaimStale(15)).toBe(1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('PENDING');
  });

  it('dead-letters a job whose type has no handler, rather than looping', async () => {
    await enqueue(prisma, 'email.send' as never, {}, { maxAttempts: 1 });
    await prisma.job.updateMany({ data: { type: 'not.a.real.handler' } });
    const result = await runDueJobs();

    expect(result.failed).toBe(1);
    const job = await prisma.job.findFirstOrThrow();
    expect(job.status).toBe('DEAD');
    expect(job.lastError).toContain('No handler registered');
  });

  it('auto-closes a resolved ticket when the job comes due, and leaves others alone', async () => {
    const resolvedTicket = await createTicket(SYSTEM, reportInput(world.portal.id));
    await transitionTicket(world.support, { ticketId: resolvedTicket.id, to: 'TRIAGE' });
    await transitionTicket(world.support, { ticketId: resolvedTicket.id, to: 'IN_PROGRESS' });
    await transitionTicket(world.support, {
      ticketId: resolvedTicket.id,
      to: 'RESOLVED',
      note: 'done',
    });

    await prisma.job.updateMany({
      where: { type: 'ticket.auto_close' },
      data: { runAt: new Date(Date.now() - 1000) },
    });
    await runDueJobs();

    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: resolvedTicket.id } })).status,
    ).toBe('CLOSED');
  });

  it('does not auto-close a ticket the reporter already reopened', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    await transitionTicket(world.support, { ticketId: id, to: 'TRIAGE' });
    await transitionTicket(world.support, { ticketId: id, to: 'IN_PROGRESS' });
    await transitionTicket(world.support, { ticketId: id, to: 'RESOLVED', note: 'done' });
    await transitionTicket(world.support, { ticketId: id, to: 'REOPENED' });

    await prisma.job.updateMany({
      where: { type: 'ticket.auto_close' },
      data: { runAt: new Date(Date.now() - 1000) },
    });
    await runDueJobs();

    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).status).toBe('REOPENED');
  });
});
