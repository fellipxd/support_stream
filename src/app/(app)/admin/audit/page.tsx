import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { hasPermission } from '@/server/authz/policy';
import { prisma } from '@/server/db/client';
import { formatDateTime } from '@/lib/format';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { Pagination } from '@/components/shell/ticket-table';

export const metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const user = await requireUser();
  if (!hasPermission(user, 'audit.read')) redirect('/dashboard');

  const page = Number(pageParam ?? 1) || 1;
  const perPage = 50;
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.auditLog.count(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Compliance"
        title="Audit log"
        description={`${total} recorded actions. Records cannot be edited or deleted.`}
      />

      <div className="mt-6">
        <Card>
          <CardHeader title="All entries" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    When
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Actor
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Action
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Entity
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-500">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-ink-800">
                      {entry.actorLabel}
                      <span className="ml-1 text-xs text-ink-500">
                        {entry.actorType.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-ink-900">{entry.action}</td>
                    <td className="px-3 py-2.5 text-ink-600">
                      {entry.entityType}
                      <span className="ml-1 font-mono text-xs text-ink-500">
                        {entry.entityId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-ink-500">{entry.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(total / perPage))}
            baseUrl="/admin/audit"
          />
        </Card>
      </div>
    </div>
  );
}
