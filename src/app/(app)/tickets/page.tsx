import { redirect } from 'next/navigation';
import type { TicketStatus } from '@prisma/client';
import { requireUser } from '@/server/auth/session';
import { hasPermission } from '@/server/authz/policy';
import { listTickets } from '@/server/tickets/service';
import { prisma } from '@/server/db/client';
import { Card, CardHeader } from '@/components/ui/primitives';
import { Pagination, TicketTable } from '@/components/shell/ticket-table';
import { TicketFilters } from '@/components/shell/ticket-filters';

export const metadata = { title: 'All tickets' };
export const dynamic = 'force-dynamic';

/** Organisation-wide search (§21). Results are always scoped by the policy layer in SQL. */
export default async function AllTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  if (!hasPermission(user, 'ticket.read.any')) redirect('/dashboard/my-tickets');

  const [result, portals] = await Promise.all([
    listTickets(user, {
      q: params.q,
      status: params.status ? (params.status.split(',') as TicketStatus[]) : undefined,
      portalId: params.portalId,
      severity: params.severity ? [params.severity as never] : undefined,
      priority: params.priority ? [params.priority as never] : undefined,
      assigneeId: params.assigneeId,
      page: Number(params.page ?? 1) || 1,
      perPage: 25,
      sort: (params.sort as 'newest' | 'oldest' | 'priority' | 'updated') ?? 'newest',
    }),
    prisma.portal.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  );
  query.delete('page');

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-bold tracking-tight text-slate-900">All tickets</h1>
      <p className="mt-1 text-sm text-slate-600">{result.total} tickets match your search.</p>

      <div className="mt-4 space-y-4">
        <TicketFilters portals={portals} basePath="/tickets" values={params} />
        <Card>
          <CardHeader title="Results" />
          <TicketTable
            rows={result.items}
            emptyTitle="No tickets found"
            emptyDescription="Try a different search term or clear the filters."
          />
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            baseUrl={`/tickets?${query.toString()}`}
          />
        </Card>
      </div>
    </div>
  );
}
