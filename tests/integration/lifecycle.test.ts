import { beforeEach, describe, expect, it } from 'vitest';
import {
  addComment,
  assignTicket,
  createTicket,
  getTimeline,
  transitionTicket,
  triageTicket,
} from '@/server/tickets/service';
import { prisma, makeWorld, reportInput, resetDatabase, SYSTEM } from '../factories';

/** The §52 acceptance scenario, driven through the service layer. */

let world: Awaited<ReturnType<typeof makeWorld>>;

beforeEach(async () => {
  await resetDatabase();
  world = await makeWorld();
});

async function newTicket() {
  return createTicket(SYSTEM, reportInput(world.portal.id));
}

describe('the full ticket lifecycle', () => {
  it('runs report → triage → QA → developer → ready → verified → resolved', async () => {
    const { id } = await newTicket();

    await triageTicket(world.support, {
      ticketId: id,
      categoryId: world.category.id,
      severity: 'S2_HIGH',
      priority: 'P1_URGENT',
    });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).status).toBe('TRIAGE');

    await assignTicket(world.support, {
      ticketId: id,
      role: 'SUPPORT',
      assigneeId: world.support.id,
    });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).status).toBe('ASSIGNED');

    await assignTicket(world.support, { ticketId: id, role: 'QA', assigneeId: world.qa.id });
    await addComment(world.qa, {
      ticketId: id,
      body: 'Reproduced on staging.',
      visibility: 'QA_NOTE',
    });

    await assignTicket(world.qa, {
      ticketId: id,
      role: 'ENGINEERING',
      assigneeId: world.developer.id,
    });
    await transitionTicket(world.qa, { ticketId: id, to: 'WAITING_FOR_DEVELOPER' });

    await addComment(world.developer, {
      ticketId: id,
      body: 'Fix implemented.',
      visibility: 'DEV_NOTE',
    });
    await transitionTicket(world.developer, { ticketId: id, to: 'READY_FOR_QA' });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).status).toBe('READY_FOR_QA');

    await transitionTicket(world.qa, { ticketId: id, to: 'QA_VERIFICATION' });
    const resolved = await transitionTicket(world.qa, {
      ticketId: id,
      to: 'RESOLVED',
      note: 'Settlement status now displays correctly.',
    });

    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolutionNote).toContain('Settlement status');
  });

  it('keeps a complete, ordered activity trail', async () => {
    const { id } = await newTicket();
    await triageTicket(world.support, {
      ticketId: id,
      categoryId: world.category.id,
      severity: 'S2_HIGH',
      priority: 'P1_URGENT',
    });
    await assignTicket(world.support, {
      ticketId: id,
      role: 'SUPPORT',
      assigneeId: world.support.id,
    });
    await transitionTicket(world.support, { ticketId: id, to: 'IN_PROGRESS' });

    const activities = await prisma.ticketActivity.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: 'asc' },
    });
    const actions = activities.map((a) => a.action);
    expect(actions).toContain('ticket.created');
    expect(actions).toContain('ticket.triaged');
    expect(actions).toContain('assignment.support');
    expect(actions).toContain('status.changed');

    const statusChanges = activities.filter((a) => a.action === 'status.changed');
    expect(statusChanges.at(-1)).toMatchObject({ oldValue: 'ASSIGNED', newValue: 'IN_PROGRESS' });
    for (const activity of activities) expect(activity.actorLabel).toBeTruthy();
  });

  it('records who did what, with before and after values', async () => {
    const { id } = await newTicket();
    await triageTicket(world.support, {
      ticketId: id,
      categoryId: world.category.id,
      severity: 'S1_CRITICAL',
      priority: 'P0_EMERGENCY',
    });

    const severityChange = await prisma.ticketActivity.findFirstOrThrow({
      where: { ticketId: id, field: 'severity' },
    });
    expect(severityChange).toMatchObject({
      actorLabel: 'Support Agent',
      oldValue: 'S3_MEDIUM',
      newValue: 'S1_CRITICAL',
    });
  });

  it('records the first staff response exactly once', async () => {
    const { id } = await newTicket();
    await addComment(world.support, {
      ticketId: id,
      body: 'Looking into this now.',
      visibility: 'PUBLIC',
    });
    const first = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(first.firstResponseAt).not.toBeNull();

    await addComment(world.support, { ticketId: id, body: 'Still looking.', visibility: 'PUBLIC' });
    const second = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(second.firstResponseAt?.getTime()).toBe(first.firstResponseAt?.getTime());
  });

  it('does not treat the reporter as the first response', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await addComment(world.reporter, { ticketId: id, body: 'Any news?', visibility: 'PUBLIC' });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).firstResponseAt).toBeNull();
  });

  it('pauses the SLA while waiting on the reporter and resumes on their reply', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await transitionTicket(world.support, { ticketId: id, to: 'TRIAGE' });
    await transitionTicket(world.support, {
      ticketId: id,
      to: 'WAITING_FOR_USER',
      note: 'Which account is affected?',
    });

    const paused = await prisma.slaInstance.findFirstOrThrow({ where: { ticketId: id } });
    expect(paused.pausedAt).not.toBeNull();

    await addComment(world.reporter, {
      ticketId: id,
      body: 'Account 12345.',
      visibility: 'PUBLIC',
    });

    const resumed = await prisma.slaInstance.findFirstOrThrow({ where: { ticketId: id } });
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.pausedMs).toBeGreaterThanOrEqual(0);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).status).toBe('IN_PROGRESS');
  });

  it('schedules auto-close when a ticket is resolved', async () => {
    const { id } = await newTicket();
    await transitionTicket(world.support, { ticketId: id, to: 'TRIAGE' });
    await transitionTicket(world.support, { ticketId: id, to: 'IN_PROGRESS' });
    await transitionTicket(world.support, { ticketId: id, to: 'RESOLVED', note: 'Fixed.' });

    const job = await prisma.job.findFirstOrThrow({ where: { type: 'ticket.auto_close' } });
    expect((job.payload as Record<string, unknown>).ticketId).toBe(id);
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('emails the reporter on resolution but not on internal movement', async () => {
    const { id } = await newTicket();
    await prisma.job.deleteMany({});

    await transitionTicket(world.support, { ticketId: id, to: 'TRIAGE' });
    await transitionTicket(world.support, { ticketId: id, to: 'IN_PROGRESS' });
    expect(await prisma.job.count({ where: { type: 'email.send' } })).toBe(0);

    await transitionTicket(world.support, { ticketId: id, to: 'RESOLVED', note: 'Fixed.' });
    const emails = await prisma.job.findMany({ where: { type: 'email.send' } });
    expect(emails).toHaveLength(1);
    expect((emails[0]!.payload as Record<string, unknown>).template).toBe('ticket_resolved');
  });

  it('counts reopens and clears the resolution timestamps', async () => {
    const { id } = await newTicket();
    await transitionTicket(world.support, { ticketId: id, to: 'TRIAGE' });
    await transitionTicket(world.support, { ticketId: id, to: 'IN_PROGRESS' });
    await transitionTicket(world.support, { ticketId: id, to: 'RESOLVED', note: 'Fixed.' });
    const reopened = await transitionTicket(world.support, { ticketId: id, to: 'REOPENED' });

    expect(reopened.reopenCount).toBe(1);
    expect(reopened.resolvedAt).toBeNull();
  });

  it('requires a primary ticket before marking a duplicate, then links it', async () => {
    const primary = await newTicket();
    const duplicate = await newTicket();

    await expect(
      transitionTicket(world.support, { ticketId: duplicate.id, to: 'DUPLICATE' }),
    ).rejects.toThrow(/duplicates/i);

    await transitionTicket(world.support, {
      ticketId: duplicate.id,
      to: 'DUPLICATE',
      duplicateOfKey: primary.key,
    });
    const relationship = await prisma.ticketRelationship.findFirstOrThrow({
      where: { sourceTicketId: duplicate.id },
    });
    expect(relationship).toMatchObject({ targetTicketId: primary.id, type: 'DUPLICATE_OF' });
  });

  it('refuses an illegal transition at the service boundary', async () => {
    const { id } = await newTicket();
    await expect(transitionTicket(world.support, { ticketId: id, to: 'RESOLVED' })).rejects.toThrow(
      /Cannot move/i,
    );
  });

  it('treats a repeat transition as a no-op', async () => {
    const { id } = await newTicket();
    await transitionTicket(world.support, { ticketId: id, to: 'TRIAGE' });
    const before = await prisma.ticketActivity.count({ where: { ticketId: id } });
    await transitionTicket(world.support, { ticketId: id, to: 'TRIAGE' });
    expect(await prisma.ticketActivity.count({ where: { ticketId: id } })).toBe(before);
  });

  it('notifies an assignee in-app and by email', async () => {
    const { id } = await newTicket();
    await prisma.job.deleteMany({});
    await assignTicket(world.support, {
      ticketId: id,
      role: 'ENGINEERING',
      assigneeId: world.developer.id,
    });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: world.developer.id },
    });
    expect(notification.type).toBe('TICKET_ASSIGNED');

    const job = await prisma.job.findFirstOrThrow({ where: { type: 'email.send' } });
    expect((job.payload as Record<string, unknown>).template).toBe('ticket_assigned');
  });

  it('does not notify the person who made the change', async () => {
    const { id } = await newTicket();
    await assignTicket(world.support, {
      ticketId: id,
      role: 'SUPPORT',
      assigneeId: world.support.id,
    });
    expect(await prisma.notification.count({ where: { userId: world.support.id } })).toBe(0);
  });

  it('keeps an assignment history alongside the current owner', async () => {
    const { id } = await newTicket();
    await assignTicket(world.support, {
      ticketId: id,
      role: 'ENGINEERING',
      assigneeId: world.developer.id,
    });
    await assignTicket(world.support, {
      ticketId: id,
      role: 'ENGINEERING',
      assigneeId: world.qa.id,
    });

    const assignments = await prisma.ticketAssignment.findMany({
      where: { ticketId: id, role: 'ENGINEERING' },
      orderBy: { assignedAt: 'asc' },
    });
    expect(assignments).toHaveLength(2);
    expect(assignments[0]!.unassignedAt).not.toBeNull();
    expect(assignments[1]!.unassignedAt).toBeNull();
  });

  it('shows staff the internal notes and the reporter only the public ones', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await addComment(world.support, {
      ticketId: id,
      body: 'Public update for you.',
      visibility: 'PUBLIC',
    });
    await addComment(world.support, {
      ticketId: id,
      body: 'Internal: customer is on the legacy plan.',
      visibility: 'INTERNAL',
    });

    const staffView = await getTimeline(world.support, id);
    expect(staffView.comments).toHaveLength(2);

    const reporterView = await getTimeline(world.reporter, id);
    expect(reporterView.comments).toHaveLength(1);
    expect(JSON.stringify(reporterView)).not.toContain('legacy plan');
  });
});
