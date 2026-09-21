import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { hasPermission } from '@/server/authz/policy';
import { prisma } from '@/server/db/client';
import { queueDepth } from '@/server/jobs/queue';
import { formatRelative } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/primitives';

export const metadata = { title: 'Administration' };
export const dynamic = 'force-dynamic';

/** Configuration overview and operational health. Admin-only, re-checked server-side. */
export default async function AdminPage() {
  const user = await requireUser();
  if (!hasPermission(user, 'config.portal.manage')) redirect('/dashboard');

  const [portals, categories, teams, users, rules, slas, jobs, audits, failedEmails] =
    await Promise.all([
      prisma.portal.count(),
      prisma.ticketCategory.count(),
      prisma.team.count(),
      prisma.user.count(),
      prisma.routingRule.count({ where: { isActive: true } }),
      prisma.slaPolicy.count({ where: { isActive: true } }),
      queueDepth(),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
      prisma.emailDelivery.count({ where: { status: 'FAILED' } }),
    ]);

  const config = [
    { label: 'Portals', value: portals, href: '/admin/portals' },
    { label: 'Categories', value: categories, href: '/admin/portals' },
    { label: 'Teams', value: teams, href: '/admin/portals' },
    { label: 'Users', value: users, href: '/admin/users' },
    { label: 'Routing rules', value: rules, href: '/admin/portals' },
    { label: 'SLA policies', value: slas, href: '/admin/portals' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Administration</h1>
      <p className="mt-1 text-sm text-slate-600">Business configuration and system health.</p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {config.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {item.label}
            </dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Background jobs" description="Email and asynchronous processing." />
          <dl className="grid grid-cols-3 gap-3 px-5 py-4 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Pending</dt>
              <dd className="text-lg font-semibold text-slate-900">{jobs.pending}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Running</dt>
              <dd className="text-lg font-semibold text-slate-900">{jobs.running}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Dead</dt>
              <dd
                className={`text-lg font-semibold ${jobs.dead > 0 ? 'text-rose-600' : 'text-slate-900'}`}
              >
                {jobs.dead}
              </dd>
            </div>
          </dl>
          {failedEmails > 0 ? (
            <p className="border-t border-slate-100 px-5 py-3 text-sm text-amber-700">
              {failedEmails} email {failedEmails === 1 ? 'delivery has' : 'deliveries have'} failed
              and will be retried.
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Portal registry" description="Configurable without a deployment." />
          <PortalList />
        </Card>
      </div>

      <div className="mt-5">
        <Card>
          <CardHeader
            title="Recent audit log"
            description="Security-sensitive and administrative actions. Append-only."
            action={
              <Link
                href="/admin/audit"
                className="text-sm font-medium text-brand-600 hover:underline"
              >
                View all
              </Link>
            }
          />
          <ul className="divide-y divide-slate-100 text-sm">
            {audits.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-2 px-5 py-2.5">
                <span className="font-medium text-slate-900">{entry.actorLabel}</span>
                <span className="text-slate-600">{entry.action.replace(/[._]/g, ' ')}</span>
                <span className="text-slate-400">{entry.entityType}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {formatRelative(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

async function PortalList() {
  const portals = await prisma.portal.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      isActive: true,
      _count: { select: { tickets: true, categories: true } },
    },
  });

  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {portals.map((portal) => (
        <li key={portal.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
          <span>
            <span className="font-medium text-slate-900">{portal.name}</span>
            <span className="ml-2 text-xs text-slate-400">
              {portal._count.categories} categories
            </span>
          </span>
          <span className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">{portal._count.tickets} tickets</span>
            <span className={portal.isActive ? 'text-emerald-600' : 'text-slate-400'}>
              {portal.isActive ? 'Active' : 'Inactive'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
