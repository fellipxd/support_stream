import type { TicketStatus } from '@prisma/client';
import { requireUser } from '@/server/auth/session';
import { listTickets } from '@/server/tickets/service';
import { OPEN_STATUSES } from '@/lib/labels';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { Pagination, TicketTable } from '@/components/shell/ticket-table';

export const metadata = { title: 'My tickets' };
export const dynamic = 'force-dynamic';

export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const status =
    params.status === 'open'
      ? OPEN_STATUSES
      : params.status
        ? ([params.status] as TicketStatus[])
        : undefined;

  const result = await listTickets(user, {
    reporterId: user.id,
    status,
    q: params.q,
    page: Number(params.page ?? 1) || 1,
    perPage: 25,
    sort: 'newest',
  });

  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.q) query.set('q', params.q);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Reported by you"
        title="My tickets"
        description={`${result.total} in total.`}
      />

      <div className="mt-6">
        <Card>
          <CardHeader title="Tickets you reported" />
          <TicketTable
            rows={result.items}
            emptyTitle="Nothing here"
            emptyDescription="No tickets match this filter."
          />
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            baseUrl={`/dashboard/my-tickets?${query.toString()}`}
          />
        </Card>
      </div>
    </div>
  );
}
