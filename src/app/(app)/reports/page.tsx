import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { hasPermission } from '@/server/authz/policy';
import { getAging, getDistributions, getKpis, rangeFor } from '@/server/reporting/service';
import { formatDuration, formatRelative } from '@/lib/format';
import { PRIORITY_LABEL, SEVERITY_LABEL, STATUS_LABEL } from '@/lib/labels';
import { Card, CardHeader } from '@/components/ui/primitives';

export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
];

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function BarList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">No data for this period.</p>
      ) : (
        <ul className="space-y-2.5 px-5 py-4">
          {rows.slice(0, 8).map((row) => (
            <li key={row.label}>
              <div className="flex items-center justify-between text-sm">
                <span className="truncate text-slate-700">{row.label}</span>
                <span className="ml-3 font-semibold tabular-nums text-slate-900">{row.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Management KPIs (§6). Every number comes from a database aggregate, not a client loop. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: preset = '30d' } = await searchParams;
  const user = await requireUser();
  if (!hasPermission(user, 'report.view')) redirect('/dashboard');

  const range = rangeFor(preset);
  const [kpis, distributions, aging] = await Promise.all([
    getKpis(user, range),
    getDistributions(user, range),
    getAging(user, 8),
  ]);

  const label = (map: Record<string, string>) => (rows: { label: string; count: number }[]) =>
    rows.map((row) => ({ ...row, label: map[row.label] ?? row.label }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ticket volume, resolution performance and SLA compliance.
          </p>
        </div>
        <nav aria-label="Date range" className="flex flex-wrap gap-1.5">
          {PRESETS.map((item) => (
            <Link
              key={item.id}
              href={`/reports?range=${item.id}`}
              aria-current={item.id === preset ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                item.id === preset
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tickets created" value={kpis.created} hint="in this period" />
        <Stat label="Open" value={kpis.open} hint="right now" />
        <Stat label="Resolved" value={kpis.resolved} />
        <Stat label="Closed" value={kpis.closed} />
        <Stat
          label="Avg first response"
          value={kpis.avgFirstResponseMs ? formatDuration(kpis.avgFirstResponseMs) : '—'}
        />
        <Stat
          label="Avg resolution"
          value={kpis.avgResolutionMs ? formatDuration(kpis.avgResolutionMs) : '—'}
        />
        <Stat
          label="Median resolution"
          value={kpis.medianResolutionMs ? formatDuration(kpis.medianResolutionMs) : '—'}
        />
        <Stat
          label="SLA compliance"
          value={kpis.slaCompliancePct === null ? '—' : `${kpis.slaCompliancePct}%`}
        />
        <Stat label="Backlog" value={kpis.backlog} hint="open tickets" />
        <Stat label="Overdue" value={kpis.overdue} hint="SLA breached" />
        <Stat label="Reopen rate" value={`${kpis.reopenRatePct}%`} />
        <Stat label="Resolution rate" value={`${kpis.resolutionRatePct}%`} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BarList title="Tickets by portal" rows={distributions.byPortal} />
        <BarList title="Tickets by category" rows={distributions.byCategory} />
        <BarList title="Tickets by status" rows={label(STATUS_LABEL)(distributions.byStatus)} />
        <BarList
          title="Tickets by severity"
          rows={label(SEVERITY_LABEL)(distributions.bySeverity)}
        />
        <BarList
          title="Tickets by priority"
          rows={label(PRIORITY_LABEL)(distributions.byPriority)}
        />
        <BarList title="Tickets by support agent" rows={distributions.byAgent} />
      </div>

      <div className="mt-5">
        <Card>
          <CardHeader title="Oldest open tickets" description="Where attention is overdue." />
          {aging.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Nothing open.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {aging.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={`/tickets/${ticket.key}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-slate-400">{ticket.key}</span>
                      <span className="mt-0.5 block truncate font-medium text-slate-900">
                        {ticket.title}
                      </span>
                      <span className="text-xs text-slate-500">
                        {ticket.portal.name} · {ticket.supportOwner?.name ?? 'Unassigned'}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      open {formatRelative(ticket.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
