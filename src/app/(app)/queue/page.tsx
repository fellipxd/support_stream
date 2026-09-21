import { redirect } from 'next/navigation';
import type { TicketStatus } from '@prisma/client';
import { requireUser } from '@/server/auth/session';
import { hasPermission } from '@/server/authz/policy';
import { listTickets } from '@/server/tickets/service';
import { prisma } from '@/server/db/client';
import { OPEN_STATUSES } from '@/lib/labels';
import { Card, CardHeader, PageHeader, PillLink } from '@/components/ui/primitives';
import { Pagination, TicketTable } from '@/components/shell/ticket-table';
import { TicketFilters } from '@/components/shell/ticket-filters';

export const metadata = { title: 'Ticket queue' };
export const dynamic = 'force-dynamic';

const UNTRIAGED: TicketStatus[] = ['NEW'];

/** The support working queue: untriaged first, then everything the agent may act on. */
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  if (!hasPermission(user, 'ticket.list.queue')) redirect('/dashboard');

  const tab = params.tab ?? 'untriaged';
  // An explicit status filter always wins; otherwise each tab has its own default so that
  // "All open" means open work, not every ticket ever closed.
  const status: TicketStatus[] | undefined = params.status
    ? (params.status.split(',') as TicketStatus[])
    : tab === 'untriaged'
      ? UNTRIAGED
      : OPEN_STATUSES;

  const [result, portals, untriagedCount] = await Promise.all([
    listTickets(user, {
      status,
      q: params.q,
      portalId: params.portalId,
      severity: params.severity ? [params.severity as never] : undefined,
      priority: params.priority ? [params.priority as never] : undefined,
      assigneeId: params.mine ? user.id : params.assigneeId,
      page: Number(params.page ?? 1) || 1,
      perPage: 25,
      sort: (params.sort as 'newest' | 'oldest' | 'priority' | 'updated') ?? 'priority',
    }),
    prisma.portal.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.ticket.count({ where: { status: 'NEW', archivedAt: null } }),
  ]);

  const tabs = [
    { id: 'untriaged', label: `Untriaged (${untriagedCount})`, href: '/queue?tab=untriaged' },
    { id: 'all', label: 'All open', href: '/queue?tab=all' },
    { id: 'mine', label: 'Assigned to me', href: '/queue?tab=all&mine=1' },
  ];

  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  );
  query.delete('page');

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Support workload"
        title="Ticket queue"
        description={
          tab === 'untriaged'
            ? 'Newly reported issues waiting for triage. Work these first.'
            : `${result.total} tickets match.`
        }
      />

      <nav aria-label="Queue views" className="mt-5 flex flex-wrap gap-1.5">
        {tabs.map((item) => (
          <PillLink
            key={item.id}
            href={item.href}
            active={item.id === tab || (item.id === 'mine' && Boolean(params.mine))}
          >
            {item.label}
          </PillLink>
        ))}
      </nav>

      <div className="mt-4 space-y-4">
        <TicketFilters portals={portals} basePath="/queue" values={params} />
        <Card>
          <CardHeader title={tab === 'untriaged' ? 'Untriaged' : 'Tickets'} />
          <TicketTable
            rows={result.items}
            emptyTitle={tab === 'untriaged' ? 'Nothing waiting for triage' : 'No tickets match'}
            emptyDescription={
              tab === 'untriaged'
                ? 'Every reported issue has been triaged. Good place to be.'
                : 'Try widening the filters.'
            }
          />
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            baseUrl={`/queue?${query.toString()}`}
          />
        </Card>
      </div>
    </div>
  );
}
