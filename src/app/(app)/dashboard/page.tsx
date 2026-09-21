import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { isStaff } from '@/server/authz/policy';
import { countByStatus, listTickets } from '@/server/tickets/service';
import { prisma } from '@/server/db/client';
import { OPEN_STATUSES } from '@/lib/labels';
import { Card, CardHeader, LinkButton } from '@/components/ui/primitives';
import { TicketTable } from '@/components/shell/ticket-table';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/** Counts a reporter actually cares about (§3 of the brief), and staff workload if relevant. */
export default async function DashboardPage() {
  const user = await requireUser();
  const staff = isStaff(user);

  const [counts, recent, assignedCount] = await Promise.all([
    countByStatus(user, { reporterUserId: user.id }),
    listTickets(user, { page: 1, perPage: 8, sort: 'newest', reporterId: user.id }),
    staff
      ? prisma.ticket.count({
          where: {
            status: { in: OPEN_STATUSES },
            OR: [{ supportOwnerId: user.id }, { qaOwnerId: user.id }, { developerId: user.id }],
          },
        })
      : Promise.resolve(0),
  ]);

  const open = OPEN_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  const waiting = counts.WAITING_FOR_USER ?? 0;
  const resolved = counts.RESOLVED ?? 0;
  const closed = counts.CLOSED ?? 0;

  const tiles = [
    { label: 'Open', value: open, href: '/dashboard/my-tickets?status=open' },
    {
      label: 'Waiting on you',
      value: waiting,
      href: '/dashboard/my-tickets?status=WAITING_FOR_USER',
    },
    { label: 'Resolved', value: resolved, href: '/dashboard/my-tickets?status=RESOLVED' },
    { label: 'Closed', value: closed, href: '/dashboard/my-tickets?status=CLOSED' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Hello, {user.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Everything you have reported, and how it is going.
          </p>
        </div>
        <LinkButton href="/report">Report an issue</LinkButton>
      </div>

      {staff && assignedCount > 0 ? (
        <Link
          href="/queue?mine=1"
          className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm hover:bg-brand-100"
        >
          <span className="font-medium text-brand-900">
            You have {assignedCount} open {assignedCount === 1 ? 'ticket' : 'tickets'} assigned to
            you
          </span>
          <span aria-hidden="true" className="text-brand-700">
            →
          </span>
        </Link>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300"
          >
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {tile.label}
            </dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{tile.value}</dd>
          </Link>
        ))}
      </dl>

      <div className="mt-6">
        <Card>
          <CardHeader
            title="My recent tickets"
            action={
              <Link
                href="/dashboard/my-tickets"
                className="text-sm font-medium text-brand-600 hover:underline"
              >
                View all
              </Link>
            }
          />
          <TicketTable
            rows={recent.items}
            emptyTitle="You have not reported anything yet"
            emptyDescription="When you report an issue it will appear here so you can follow its progress."
          />
        </Card>
      </div>
    </div>
  );
}
