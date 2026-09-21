import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTicket, getTicketByKey } from '@/server/tickets/service';
import { hashToken } from '@/server/auth/tokens';
import { prisma, makeWorld, reportInput, resetDatabase, SYSTEM } from '../factories';

/** docs/TEST_STRATEGY.md §3 — creation writes ticket, history, SLA and jobs in one commit. */

let world: Awaited<ReturnType<typeof makeWorld>>;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  world = await makeWorld();
});

describe('ticket creation', () => {
  it('creates a guest ticket with a human-readable key', async () => {
    const result = await createTicket(SYSTEM, reportInput(world.portal.id));
    expect(result.key).toMatch(/^SUP-\d{6}$/);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: result.id } });
    expect(ticket.status).toBe('NEW');
    expect(ticket.guestReporterId).not.toBeNull();
    expect(ticket.reporterUserId).toBeNull();
  });

  it('allocates sequential, non-colliding keys', async () => {
    const keys: string[] = [];
    for (let i = 0; i < 5; i++) {
      keys.push((await createTicket(SYSTEM, reportInput(world.portal.id))).key);
    }
    expect(new Set(keys).size).toBe(5);
    expect(keys).toEqual(['SUP-000001', 'SUP-000002', 'SUP-000003', 'SUP-000004', 'SUP-000005']);
  });

  it('never collides under concurrent submission', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => createTicket(SYSTEM, reportInput(world.portal.id))),
    );
    expect(new Set(results.map((r) => r.key)).size).toBe(12);
  });

  it('records the reporter for an authenticated user instead of a guest', async () => {
    const result = await createTicket(world.reporter, reportInput(world.portal.id));
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: result.id } });
    expect(ticket.reporterUserId).toBe(world.reporter.id);
    expect(ticket.guestReporterId).toBeNull();
  });

  it('writes the opening activity entry', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const activities = await prisma.ticketActivity.findMany({ where: { ticketId: id } });
    expect(activities.some((a) => a.action === 'ticket.created')).toBe(true);
  });

  it('opens an SLA instance with both deadlines', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const sla = await prisma.slaInstance.findFirstOrThrow({ where: { ticketId: id } });
    expect(sla.firstResponseDueAt.getTime()).toBeLessThan(sla.resolutionDueAt.getTime());
    expect(sla.state).toBe('OK');
  });

  it('queues the acknowledgement email rather than sending it inline', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const jobs = await prisma.job.findMany({ where: { type: 'email.send' } });
    expect(jobs).toHaveLength(1);
    expect((jobs[0]!.payload as Record<string, unknown>).template).toBe('ticket_received');
    expect((jobs[0]!.payload as Record<string, unknown>).to).toBe('guest@example.com');
    // Nothing has actually been delivered yet — the ticket does not wait on the mail server.
    expect(await prisma.emailDelivery.count()).toBe(0);
    expect(id).toBeTruthy();
  });

  it('stores the guest access token only as a hash', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const token = await prisma.guestAccessToken.findFirstOrThrow({ where: { ticketId: id } });
    expect(token.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // The hash of the raw token is what is stored; the raw token itself lives only in email.
    expect(token.tokenHash).not.toBe(hashToken(''));
  });

  it('routes the ticket to the portal default project', async () => {
    await prisma.routingRule.create({
      data: { name: 'default', portalId: world.portal.id, projectId: world.project.id },
    });
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(ticket.projectId).toBe(world.project.id);
  });

  it('builds searchable text from the key, title, description and reporter', async () => {
    const { id, key } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(ticket.searchText).toContain(key.toLowerCase());
    expect(ticket.searchText).toContain('ward');
    expect(ticket.searchText).toContain('guest@example.com');
  });

  it('rejects an unknown portal', async () => {
    await expect(
      createTicket(SYSTEM, reportInput('00000000-0000-0000-0000-000000000000')),
    ).rejects.toThrow(/portal/i);
  });

  it('rejects a category that belongs to another portal', async () => {
    const other = await prisma.portal.create({
      data: { organizationId: world.org.id, name: 'Other', slug: `other-${Date.now()}` },
    });
    const foreign = await prisma.ticketCategory.create({
      data: { portalId: other.id, name: 'Foreign', slug: 'foreign' },
    });
    await expect(
      createTicket(SYSTEM, reportInput(world.portal.id, { categoryId: foreign.id })),
    ).rejects.toThrow(/category/i);
  });

  it('requires a name and email from an anonymous reporter', async () => {
    await expect(
      createTicket(
        SYSTEM,
        reportInput(world.portal.id, { reporterName: undefined, reporterEmail: undefined }),
      ),
    ).rejects.toThrow(/name and email/i);
  });

  it('makes the new ticket readable by its key', async () => {
    const { key } = await createTicket(world.reporter, reportInput(world.portal.id));
    const ticket = await getTicketByKey(world.reporter, key);
    expect(ticket.key).toBe(key);
  });

  it('finds a ticket by lower-case key too', async () => {
    const { key } = await createTicket(world.reporter, reportInput(world.portal.id));
    await expect(getTicketByKey(world.reporter, key.toLowerCase())).resolves.toMatchObject({ key });
  });
});
