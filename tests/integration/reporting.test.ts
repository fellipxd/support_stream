import { beforeEach, describe, expect, it } from 'vitest';
import { createTicket, transitionTicket, triageTicket } from '@/server/tickets/service';
import { getAging, getDistributions, getKpis, rangeFor } from '@/server/reporting/service';
import { makeWorld, reportInput, resetDatabase, SYSTEM } from '../factories';

/** docs/PRODUCT_REQUIREMENTS.md §6 — management numbers computed in the database. */

let world: Awaited<ReturnType<typeof makeWorld>>;

beforeEach(async () => {
  await resetDatabase();
  world = await makeWorld();
});

async function resolvedTicket(severity: 'S1_CRITICAL' | 'S2_HIGH' | 'S3_MEDIUM' = 'S3_MEDIUM') {
  const ticket = await createTicket(SYSTEM, reportInput(world.portal.id));
  await triageTicket(world.support, {
    ticketId: ticket.id,
    categoryId: world.category.id,
    severity,
    priority: 'P2_NORMAL',
  });
  await transitionTicket(world.support, { ticketId: ticket.id, to: 'IN_PROGRESS' });
  await transitionTicket(world.support, { ticketId: ticket.id, to: 'RESOLVED', note: 'Fixed.' });
  return ticket;
}

describe('KPIs', () => {
  it('counts created, open and resolved tickets', async () => {
    await createTicket(SYSTEM, reportInput(world.portal.id));
    await createTicket(SYSTEM, reportInput(world.portal.id));
    await resolvedTicket();

    const kpis = await getKpis(world.admin, rangeFor('30d'));
    expect(kpis.created).toBe(3);
    expect(kpis.open).toBe(2);
    expect(kpis.resolved).toBe(1);
  });

  it('measures first response and resolution times', async () => {
    await resolvedTicket();
    const kpis = await getKpis(world.admin, rangeFor('30d'));
    expect(kpis.avgFirstResponseMs).not.toBeNull();
    expect(kpis.avgResolutionMs).not.toBeNull();
    expect(kpis.medianResolutionMs).not.toBeNull();
  });

  it('reports a reopen rate', async () => {
    const ticket = await resolvedTicket();
    await transitionTicket(world.support, { ticketId: ticket.id, to: 'REOPENED' });

    const kpis = await getKpis(world.admin, rangeFor('30d'));
    expect(kpis.reopenRatePct).toBe(100);
  });

  it('reports SLA compliance once tickets are resolved', async () => {
    await resolvedTicket();
    const kpis = await getKpis(world.admin, rangeFor('30d'));
    expect(kpis.slaCompliancePct).toBe(100);
  });

  it('returns zeroed, not broken, numbers with no data', async () => {
    const kpis = await getKpis(world.admin, rangeFor('30d'));
    expect(kpis).toMatchObject({ created: 0, open: 0, resolved: 0, reopenRatePct: 0 });
    expect(kpis.avgResolutionMs).toBeNull();
    expect(kpis.slaCompliancePct).toBeNull();
  });

  it('refuses a user without the reporting permission', async () => {
    await expect(getKpis(world.reporter, rangeFor('30d'))).rejects.toMatchObject({
      httpStatus: 403,
    });
    await expect(getKpis(world.developer, rangeFor('30d'))).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('allows support, leads and management', async () => {
    await expect(getKpis(world.support, rangeFor('30d'))).resolves.toBeTruthy();
    await expect(getKpis(world.admin, rangeFor('7d'))).resolves.toBeTruthy();
  });
});

describe('distributions', () => {
  it('groups by portal, category, severity, priority and status', async () => {
    await resolvedTicket('S1_CRITICAL');
    await createTicket(SYSTEM, reportInput(world.portal.id));

    const distributions = await getDistributions(world.admin, rangeFor('30d'));
    expect(distributions.byPortal[0]).toMatchObject({ label: 'Test Portal', count: 2 });
    expect(distributions.bySeverity.find((r) => r.label === 'S1_CRITICAL')?.count).toBe(1);
    expect(distributions.byStatus.find((r) => r.label === 'RESOLVED')?.count).toBe(1);
    expect(distributions.byCategory.find((r) => r.label === 'Payment')?.count).toBe(1);
  });

  it('labels unassigned work rather than dropping it', async () => {
    await createTicket(SYSTEM, reportInput(world.portal.id));
    const distributions = await getDistributions(world.admin, rangeFor('30d'));
    expect(distributions.byAgent[0]).toMatchObject({ label: 'Unassigned', count: 1 });
    expect(distributions.byCategory[0]).toMatchObject({ label: 'Uncategorised' });
  });
});

describe('aging', () => {
  it('lists the oldest open tickets first and excludes resolved ones', async () => {
    const first = await createTicket(
      SYSTEM,
      reportInput(world.portal.id, { title: 'Oldest open' }),
    );
    await createTicket(SYSTEM, reportInput(world.portal.id, { title: 'Newer open' }));
    await resolvedTicket();

    const aging = await getAging(world.admin, 10);
    expect(aging[0]!.id).toBe(first.id);
    expect(aging.map((t) => t.title)).not.toContain('I cannot make payment for my ward, resolved');
    expect(aging).toHaveLength(2);
  });
});

describe('date ranges', () => {
  it('builds each preset window', () => {
    for (const preset of ['today', '7d', '30d', 'quarter', 'year']) {
      const range = rangeFor(preset);
      expect(range.from.getTime()).toBeLessThanOrEqual(range.to.getTime());
    }
  });

  it('honours a custom range', () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-02-01');
    expect(rangeFor('custom', { from, to })).toEqual({ from, to });
  });
});
