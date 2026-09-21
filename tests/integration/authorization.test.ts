import { beforeEach, describe, expect, it } from 'vitest';
import {
  addComment,
  assignTicket,
  createTicket,
  getAttachments,
  getTicketByKey,
  getTicketById,
  getTimeline,
  listTickets,
  transitionTicket,
  triageTicket,
} from '@/server/tickets/service';
import { guestActor, prisma, makeWorld, reportInput, resetDatabase, SYSTEM } from '../factories';

/** docs/SECURITY_MODEL.md T1, T4, T5, T6 — the negative suite, at the service boundary. */

let world: Awaited<ReturnType<typeof makeWorld>>;

beforeEach(async () => {
  await resetDatabase();
  world = await makeWorld();
});

describe('cross-user access (IDOR)', () => {
  it('hides another reporter’s ticket behind a not-found, not a forbidden', async () => {
    const { key } = await createTicket(world.reporter, reportInput(world.portal.id));
    // A 403 would confirm the ticket exists. Both answers must look identical.
    await expect(getTicketByKey(world.otherReporter, key)).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('refuses a direct id lookup of someone else’s ticket', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await expect(getTicketById(world.otherReporter, id)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('keeps another reporter’s ticket out of list results', async () => {
    await createTicket(world.reporter, reportInput(world.portal.id));
    const list = await listTickets(world.otherReporter, { page: 1, perPage: 50, sort: 'newest' });
    expect(list.items).toHaveLength(0);
    expect(list.total).toBe(0);
  });

  it('limits a developer to tickets assigned to them', async () => {
    const unassigned = await createTicket(SYSTEM, reportInput(world.portal.id));
    const assigned = await createTicket(SYSTEM, reportInput(world.portal.id));
    await assignTicket(world.support, {
      ticketId: assigned.id,
      role: 'ENGINEERING',
      assigneeId: world.developer.id,
    });

    const list = await listTickets(world.developer, { page: 1, perPage: 50, sort: 'newest' });
    expect(list.items.map((t) => t.id)).toEqual([assigned.id]);
    await expect(getTicketById(world.developer, unassigned.id)).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('lets support see every ticket in the organisation', async () => {
    await createTicket(world.reporter, reportInput(world.portal.id));
    await createTicket(world.otherReporter, reportInput(world.portal.id));
    const list = await listTickets(world.support, { page: 1, perPage: 50, sort: 'newest' });
    expect(list.total).toBe(2);
  });
});

describe('guest scope', () => {
  it('binds a guest session to exactly one ticket', async () => {
    const mine = await createTicket(SYSTEM, reportInput(world.portal.id));
    const theirs = await createTicket(SYSTEM, reportInput(world.portal.id));
    const guestReporter = await prisma.guestReporter.findFirstOrThrow();
    const guest = guestActor(mine.id, guestReporter.id);

    await expect(getTicketById(guest, mine.id)).resolves.toMatchObject({ id: mine.id });
    await expect(getTicketById(guest, theirs.id)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('shows a guest only their own ticket in a list', async () => {
    const mine = await createTicket(SYSTEM, reportInput(world.portal.id));
    await createTicket(SYSTEM, reportInput(world.portal.id));
    const guestReporter = await prisma.guestReporter.findFirstOrThrow();

    const list = await listTickets(guestActor(mine.id, guestReporter.id), {
      page: 1,
      perPage: 50,
      sort: 'newest',
    });
    expect(list.items.map((t) => t.id)).toEqual([mine.id]);
  });

  it('refuses to let a guest write an internal note', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const guestReporter = await prisma.guestReporter.findFirstOrThrow();
    await expect(
      addComment(guestActor(id, guestReporter.id), {
        ticketId: id,
        body: 'sneaky',
        visibility: 'INTERNAL',
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });
});

describe('internal content disclosure', () => {
  it('excludes internal comments from a reporter’s timeline', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    // The developer only reaches the ticket once it is assigned to them — that is the point of
    // the 'assigned' scope, so the fixture has to set it up the way the workflow would.
    await assignTicket(world.support, {
      ticketId: id,
      role: 'ENGINEERING',
      assigneeId: world.developer.id,
    });
    await addComment(world.support, {
      ticketId: id,
      body: 'CONFIDENTIAL internal detail',
      visibility: 'INTERNAL',
    });
    await addComment(world.qa, {
      ticketId: id,
      body: 'QA reproduction steps, internal',
      visibility: 'QA_NOTE',
    });
    await addComment(world.developer, {
      ticketId: id,
      body: 'Root cause in billing service',
      visibility: 'DEV_NOTE',
    });
    await addComment(world.support, {
      ticketId: id,
      body: 'We are looking into this.',
      visibility: 'PUBLIC',
    });

    const timeline = await getTimeline(world.reporter, id);
    const serialised = JSON.stringify(timeline);
    expect(serialised).not.toContain('CONFIDENTIAL');
    expect(serialised).not.toContain('reproduction steps');
    expect(serialised).not.toContain('billing service');
    expect(serialised).toContain('We are looking into this.');
  });

  it('excludes internal activity events from a reporter’s timeline', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await addComment(world.support, { ticketId: id, body: 'internal', visibility: 'INTERNAL' });

    const reporterView = await getTimeline(world.reporter, id);
    expect(
      reporterView.activities.every((a) => a.visibility === 'PUBLIC' || a.visibility === 'SYSTEM'),
    ).toBe(true);
  });

  it('never emails a reporter about an internal note', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await prisma.job.deleteMany({});
    await addComment(world.support, {
      ticketId: id,
      body: 'internal only',
      visibility: 'INTERNAL',
    });

    const emailJobs = await prisma.job.findMany({ where: { type: 'email.send' } });
    const toReporter = emailJobs.filter(
      (job) => (job.payload as Record<string, unknown>).to === world.reporter.email,
    );
    expect(toReporter).toHaveLength(0);
  });

  it('hides internal attachments from the reporter', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await prisma.ticketAttachment.createMany({
      data: [
        {
          ticketId: id,
          storageKey: 'k1',
          filename: 'public.png',
          mimeType: 'image/png',
          sizeBytes: 10,
          visibility: 'PUBLIC',
        },
        {
          ticketId: id,
          storageKey: 'k2',
          filename: 'internal-logs.txt',
          mimeType: 'text/plain',
          sizeBytes: 10,
          visibility: 'INTERNAL',
        },
      ],
    });

    const reporterFiles = await getAttachments(world.reporter, id);
    expect(reporterFiles.map((f) => f.filename)).toEqual(['public.png']);

    const staffFiles = await getAttachments(world.support, id);
    expect(staffFiles).toHaveLength(2);
  });
});

describe('privilege boundaries', () => {
  it('stops a plain user triaging a ticket', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await expect(
      triageTicket(world.reporter, {
        ticketId: id,
        severity: 'S1_CRITICAL',
        priority: 'P0_EMERGENCY',
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('stops a developer assigning support ownership', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    await assignTicket(world.support, {
      ticketId: id,
      role: 'ENGINEERING',
      assigneeId: world.developer.id,
    });
    await expect(
      assignTicket(world.developer, {
        ticketId: id,
        role: 'SUPPORT',
        assigneeId: world.developer.id,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('stops a reporter resolving their own ticket', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await transitionTicket(world.support, { ticketId: id, to: 'TRIAGE' });
    await transitionTicket(world.support, { ticketId: id, to: 'IN_PROGRESS' });
    await expect(
      transitionTicket(world.reporter, { ticketId: id, to: 'RESOLVED' }),
    ).rejects.toMatchObject({
      httpStatus: 409,
    });
  });

  it('stops a developer resolving a ticket assigned to them', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    await assignTicket(world.support, {
      ticketId: id,
      role: 'ENGINEERING',
      assigneeId: world.developer.id,
    });
    await transitionTicket(world.support, { ticketId: id, to: 'TRIAGE' });
    await transitionTicket(world.support, { ticketId: id, to: 'IN_PROGRESS' });
    await expect(
      transitionTicket(world.developer, { ticketId: id, to: 'RESOLVED' }),
    ).rejects.toMatchObject({
      httpStatus: 409,
    });
  });

  it('lets an unrelated reporter neither read nor comment', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await expect(
      addComment(world.otherReporter, { ticketId: id, body: 'hello', visibility: 'PUBLIC' }),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe('search scoping', () => {
  it('does not leak other people’s tickets through a search term', async () => {
    await createTicket(
      world.reporter,
      reportInput(world.portal.id, { title: 'Secret project failure' }),
    );
    const results = await listTickets(world.otherReporter, {
      q: 'secret',
      page: 1,
      perPage: 50,
      sort: 'newest',
    });
    expect(results.items).toHaveLength(0);
  });

  it('finds a ticket by its key for someone entitled to see it', async () => {
    const { key } = await createTicket(world.reporter, reportInput(world.portal.id));
    const results = await listTickets(world.support, {
      q: key,
      page: 1,
      perPage: 50,
      sort: 'newest',
    });
    expect(results.items.map((t) => t.key)).toEqual([key]);
  });
});
