import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { isStaff } from '@/server/authz/policy';
import { countByStatus, listTickets } from '@/server/tickets/service';
import { prisma } from '@/server/db/client';
import { OPEN_STATUSES } from '@/lib/labels';
import { Card, CardHeader, LinkButton, PageHeader, StatTile } from '@/components/ui/primitives';
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
      <PageHeader
        eyebrow="Overview"
        title={`Hello, ${user.name.split(' ')[0]}`}
        description="Everything you have reported, and how it is going."
        action={<LinkButton href="/report">Report an issue</LinkButton>}
      />

      {staff && assignedCount > 0 ? (
        <Link
          href="/queue?mine=1"
          className="group mt-6 flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm shadow-xs transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-brand-300 hover:bg-brand-100 hover:shadow-sm"
        >
          <span className="font-medium text-brand-900">
            You have {assignedCount} open {assignedCount === 1 ? 'ticket' : 'tickets'} assigned to
            you
          </span>
          <span
            aria-hidden="true"
            className="text-brand-700 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
      ) : null}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} href={tile.href} />
        ))}
      </dl>

      <div className="mt-6">
        <Card>
          <CardHeader
            title="My recent tickets"
            action={
              <Link
                href="/dashboard/my-tickets"
                className="text-sm font-medium text-brand-700 underline-offset-4 transition-colors duration-150 ease-out hover:text-brand-600 hover:underline"
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
