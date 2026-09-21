import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import type { Actor } from '../authz/actor';
import { requirePermission } from '../authz/policy';
import { OPEN_STATUSES } from '@/lib/labels';

/**
 * Management KPIs (docs/PRODUCT_REQUIREMENTS.md §6). Aggregates run in the database — nothing
 * loads a ticket set into the application to count it.
 */
export type DateRange = { from: Date; to: Date };

export function rangeFor(preset: string, custom?: Partial<DateRange>): DateRange {
  const to = custom?.to ?? new Date();
  const start = (days: number) => new Date(to.getTime() - days * 86_400_000);
  switch (preset) {
    case 'today':
      return { from: new Date(new Date(to).setHours(0, 0, 0, 0)), to };
    case '7d':
      return { from: start(7), to };
    case '30d':
      return { from: start(30), to };
    case 'quarter':
      return { from: start(90), to };
    case 'year':
      return { from: start(365), to };
    case 'custom':
      return { from: custom?.from ?? start(30), to };
    default:
      return { from: start(30), to };
  }
}

export type Kpis = {
  total: number;
  created: number;
  open: number;
  resolved: number;
  closed: number;
  reopened: number;
  overdue: number;
  avgFirstResponseMs: number | null;
  avgResolutionMs: number | null;
  medianResolutionMs: number | null;
  slaCompliancePct: number | null;
  reopenRatePct: number;
  resolutionRatePct: number;
  backlog: number;
};

export async function getKpis(actor: Actor, range: DateRange, portalId?: string): Promise<Kpis> {
  requirePermission(actor, 'report.view');
  const scope: Prisma.TicketWhereInput = { archivedAt: null, ...(portalId ? { portalId } : {}) };
  const inRange: Prisma.TicketWhereInput = {
    ...scope,
    createdAt: { gte: range.from, lte: range.to },
  };

  const [total, created, open, resolved, closed, reopened, backlog, reopenedEver] =
    await Promise.all([
      prisma.ticket.count({ where: scope }),
      prisma.ticket.count({ where: inRange }),
      prisma.ticket.count({ where: { ...scope, status: { in: OPEN_STATUSES } } }),
      prisma.ticket.count({
        where: { ...scope, status: 'RESOLVED', resolvedAt: { gte: range.from, lte: range.to } },
      }),
      prisma.ticket.count({
        where: { ...scope, status: 'CLOSED', closedAt: { gte: range.from, lte: range.to } },
      }),
      prisma.ticket.count({ where: { ...inRange, status: 'REOPENED' } }),
      prisma.ticket.count({ where: { ...scope, status: { in: OPEN_STATUSES } } }),
      prisma.ticket.count({ where: { ...inRange, reopenCount: { gt: 0 } } }),
    ]);

  const durations = await prisma.$queryRaw<
    Array<{ avg_first: number | null; avg_res: number | null; median_res: number | null }>
  >`
    SELECT
      AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) * 1000) AS avg_first,
      AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) * 1000) AS avg_res,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) * 1000) AS median_res
    FROM "Ticket"
    WHERE "archivedAt" IS NULL
      AND "createdAt" BETWEEN ${range.from} AND ${range.to}
      ${portalId ? Prisma.sql`AND "portalId" = ${portalId}` : Prisma.empty}
  `;

  const [overdue, slaTotal, slaMet] = await Promise.all([
    prisma.slaInstance.count({ where: { state: 'BREACHED', ticket: scope } }),
    prisma.slaInstance.count({ where: { ticket: { ...inRange } } }),
    prisma.slaInstance.count({ where: { state: 'MET', ticket: { ...inRange } } }),
  ]);

  const row = durations[0];
  const resolvedInRange = resolved + closed;

  return {
    total,
    created,
    open,
    resolved,
    closed,
    reopened,
    overdue,
    avgFirstResponseMs: row?.avg_first ? Number(row.avg_first) : null,
    avgResolutionMs: row?.avg_res ? Number(row.avg_res) : null,
    medianResolutionMs: row?.median_res ? Number(row.median_res) : null,
    slaCompliancePct: slaTotal > 0 ? Math.round((slaMet / slaTotal) * 100) : null,
    reopenRatePct: created > 0 ? Math.round((reopenedEver / created) * 100) : 0,
    resolutionRatePct: created > 0 ? Math.round((resolvedInRange / created) * 100) : 0,
    backlog,
  };
}

export type Distribution = { label: string; count: number }[];

export async function getDistributions(actor: Actor, range: DateRange) {
  requirePermission(actor, 'report.view');
  const where: Prisma.TicketWhereInput = {
    archivedAt: null,
    createdAt: { gte: range.from, lte: range.to },
  };

  const [byPortal, byCategory, bySeverity, byPriority, byStatus, byAgent] = await Promise.all([
    prisma.ticket.groupBy({ by: ['portalId'], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['severity'], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['priority'], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['supportOwnerId'], where, _count: { _all: true } }),
  ]);

  const [portals, categories, users] = await Promise.all([
    prisma.portal.findMany({ select: { id: true, name: true } }),
    prisma.ticketCategory.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);

  const nameOf = (
    list: Array<{ id: string; name: string }>,
    id: string | null,
    fallback = 'Unassigned',
  ) => (id && list.find((x) => x.id === id)?.name) || fallback;

  return {
    byPortal: byPortal
      .map((r) => ({ label: nameOf(portals, r.portalId, 'Unknown'), count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    byCategory: byCategory
      .map((r) => ({
        label: nameOf(categories, r.categoryId, 'Uncategorised'),
        count: r._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    bySeverity: bySeverity.map((r) => ({ label: r.severity, count: r._count._all })),
    byPriority: byPriority.map((r) => ({ label: r.priority, count: r._count._all })),
    byStatus: byStatus
      .map((r) => ({ label: r.status, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    byAgent: byAgent
      .map((r) => ({ label: nameOf(users, r.supportOwnerId), count: r._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Daily created vs resolved — the volume trend management asks for first. */
export async function getTrend(actor: Actor, range: DateRange) {
  requirePermission(actor, 'report.view');
  return prisma.$queryRaw<Array<{ day: Date; created: bigint; resolved: bigint }>>`
    SELECT d::date AS day,
      COUNT(*) FILTER (WHERE t."createdAt"::date = d::date) AS created,
      COUNT(*) FILTER (WHERE t."resolvedAt"::date = d::date) AS resolved
    FROM generate_series(${range.from}::date, ${range.to}::date, '1 day') d
    LEFT JOIN "Ticket" t ON t."createdAt"::date = d::date OR t."resolvedAt"::date = d::date
    GROUP BY d ORDER BY d
  `;
}

/** Oldest open tickets — the aging report. */
export async function getAging(actor: Actor, limit = 10) {
  requirePermission(actor, 'report.view');
  return prisma.ticket.findMany({
    where: { archivedAt: null, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      key: true,
      title: true,
      status: true,
      priority: true,
      severity: true,
      createdAt: true,
      portal: { select: { name: true } },
      supportOwner: { select: { name: true } },
    },
  });
}
