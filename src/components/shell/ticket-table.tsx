import Link from 'next/link';
import type { Priority, Severity, TicketStatus } from '@prisma/client';
import { formatRelative } from '@/lib/format';
import { EmptyState } from '@/components/ui/primitives';
import { PriorityBadge, SeverityBadge, StatusBadge } from '@/components/ui/ticket-badges';

export type TicketRow = {
  id: string;
  key: string;
  title: string;
  status: TicketStatus;
  severity: Severity;
  priority: Priority;
  createdAt: Date;
  portal: { name: string };
  category: { name: string } | null;
  supportOwner: { name: string } | null;
};

/** Responsive list: a table on desktop, stacked cards on phones. Server-paginated by callers. */
export function TicketTable({
  rows,
  emptyTitle,
  emptyDescription,
}: {
  rows: TicketRow[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-2.5 font-medium">
              Ticket
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Portal
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Status
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Priority
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Owner
            </th>
            <th scope="col" className="px-5 py-2.5 font-medium">
              Reported
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-5 py-3">
                <Link
                  href={`/tickets/${row.key}`}
                  className="block font-medium text-slate-900 hover:text-brand-600"
                >
                  <span className="font-mono text-xs text-slate-400">{row.key}</span>
                  <span className="mt-0.5 block max-w-md truncate">{row.title}</span>
                </Link>
              </td>
              <td className="px-3 py-3 text-slate-600">
                {row.portal.name}
                {row.category ? (
                  <span className="block text-xs text-slate-400">{row.category.name}</span>
                ) : null}
              </td>
              <td className="px-3 py-3">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-col items-start gap-1">
                  <PriorityBadge priority={row.priority} />
                  <SeverityBadge severity={row.severity} />
                </div>
              </td>
              <td className="px-3 py-3 text-slate-600">
                {row.supportOwner?.name ?? <span className="text-slate-400">Unassigned</span>}
              </td>
              <td className="px-5 py-3 text-slate-500">{formatRelative(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link href={`/tickets/${row.key}`} className="block px-4 py-3 hover:bg-slate-50">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-400">{row.key}</span>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-1 font-medium text-slate-900">{row.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                <span>{row.portal.name}</span>
                <span aria-hidden="true">·</span>
                <span>{formatRelative(row.createdAt)}</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pagination({
  page,
  pageCount,
  baseUrl,
}: {
  page: number;
  pageCount: number;
  baseUrl: string;
}) {
  if (pageCount <= 1) return null;
  const build = (n: number) => `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${n}`;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm"
    >
      <span className="text-slate-500">
        Page {page} of {pageCount}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={build(page - 1)}
            className="rounded-lg bg-white px-3 py-1.5 font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link
            href={build(page + 1)}
            className="rounded-lg bg-white px-3 py-1.5 font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
