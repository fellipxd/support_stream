import { beforeEach, describe, expect, it } from 'vitest';
import { assignTicket, createTicket } from '@/server/tickets/service';
import { prisma, makeWorld, reportInput, resetDatabase, SYSTEM } from '../factories';

/** §41 of the brief — a workflow action is all-or-nothing. */

let world: Awaited<ReturnType<typeof makeWorld>>;

beforeEach(async () => {
  await resetDatabase();
  world = await makeWorld();
});

/**
 * Forces a genuine failure *inside* the service's transaction by making the database itself
 * reject an insert. Spying on the Prisma singleton would not work: the service writes through
 * the transaction client, which is a different object — so only the database can prove that
 * the whole unit of work rolled back.
 */
async function withFailingInsertsOn<T>(table: string, run: () => Promise<T>): Promise<void> {
  const fn = `fail_${table.toLowerCase()}_insert`;
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'injected failure writing ${table}'; END;
    $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${fn}_trigger BEFORE INSERT ON "${table}"
    FOR EACH ROW EXECUTE FUNCTION ${fn}();
  `);
  try {
    await expect(run()).rejects.toThrow(/injected failure/);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn}_trigger ON "${table}"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
  }
}

describe('transactional integrity', () => {
  it('writes ticket, activity, SLA, notification and job in one commit', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const [activities, sla, jobs] = await Promise.all([
      prisma.ticketActivity.count({ where: { ticketId: id } }),
      prisma.slaInstance.count({ where: { ticketId: id } }),
      prisma.job.count({ where: { type: 'email.send' } }),
    ]);
    expect(activities).toBeGreaterThan(0);
    expect(sla).toBe(1);
    expect(jobs).toBe(1);
  });

  it('leaves nothing behind when ticket creation fails part-way through', async () => {
    const before = {
      tickets: await prisma.ticket.count(),
      guests: await prisma.guestReporter.count(),
      activities: await prisma.ticketActivity.count(),
      jobs: await prisma.job.count(),
      tokens: await prisma.guestAccessToken.count(),
    };

    // The SLA row is written after the ticket, the guest reporter and the first activity.
    await withFailingInsertsOn('SlaInstance', () =>
      createTicket(SYSTEM, reportInput(world.portal.id)),
    );

    expect(await prisma.ticket.count()).toBe(before.tickets);
    expect(await prisma.guestReporter.count()).toBe(before.guests);
    expect(await prisma.ticketActivity.count()).toBe(before.activities);
    expect(await prisma.job.count()).toBe(before.jobs);
    expect(await prisma.guestAccessToken.count()).toBe(before.tokens);
  });

  it('leaves no partial assignment when notification writing fails', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const activitiesBefore = await prisma.ticketActivity.count({ where: { ticketId: id } });

    await withFailingInsertsOn('Notification', () =>
      assignTicket(world.support, {
        ticketId: id,
        role: 'ENGINEERING',
        assigneeId: world.developer.id,
      }),
    );

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(ticket.developerId).toBeNull(); // the ticket update rolled back with everything else
    expect(await prisma.ticketAssignment.count({ where: { ticketId: id } })).toBe(0);
    expect(await prisma.ticketActivity.count({ where: { ticketId: id } })).toBe(activitiesBefore);
  });

  it('does not burn a ticket key when the transaction rolls back', async () => {
    const first = await createTicket(SYSTEM, reportInput(world.portal.id));
    expect(first.key).toBe('SUP-000001');

    const counterBefore = await prisma.ticketCounter.findUniqueOrThrow({
      where: { prefix: 'SUP' },
    });
    await withFailingInsertsOn('SlaInstance', () =>
      createTicket(SYSTEM, reportInput(world.portal.id)),
    );

    // The counter increment is part of the same transaction, so it rolled back too and the
    // next real ticket continues the sequence without a gap.
    const counterAfter = await prisma.ticketCounter.findUniqueOrThrow({ where: { prefix: 'SUP' } });
    expect(counterAfter.nextValue).toBe(counterBefore.nextValue);

    const next = await createTicket(SYSTEM, reportInput(world.portal.id));
    expect(next.key).toBe('SUP-000002');
  });

  it('enforces the single-reporter rule at the database level', async () => {
    const guest = await prisma.guestReporter.create({ data: { name: 'G', email: 'g@e.com' } });
    await expect(
      prisma.ticket.create({
        data: {
          key: 'SUP-999999',
          organizationId: world.org.id,
          portalId: world.portal.id,
          title: 'Two reporters',
          description: 'Should be impossible',
          reporterUserId: world.reporter.id,
          guestReporterId: guest.id,
        },
      }),
    ).rejects.toThrow(/ticket_single_reporter/);
  });

  it('refuses a ticket with no reporter at all', async () => {
    await expect(
      prisma.ticket.create({
        data: {
          key: 'SUP-999998',
          organizationId: world.org.id,
          portalId: world.portal.id,
          title: 'No reporter',
          description: 'Should be impossible',
        },
      }),
    ).rejects.toThrow(/ticket_single_reporter/);
  });

  it('refuses a self-referencing relationship', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    await expect(
      prisma.ticketRelationship.create({
        data: { sourceTicketId: id, targetTicketId: id, type: 'RELATED_TO' },
      }),
    ).rejects.toThrow(/relationship_not_self/);
  });

  it('keeps the ticket key unique even if two rows claim it', async () => {
    const { key } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const guest = await prisma.guestReporter.create({ data: { name: 'G', email: 'g2@e.com' } });
    await expect(
      prisma.ticket.create({
        data: {
          key,
          organizationId: world.org.id,
          portalId: world.portal.id,
          title: 'Duplicate key',
          description: 'Should be impossible',
          guestReporterId: guest.id,
        },
      }),
    ).rejects.toThrow();
  });
});
