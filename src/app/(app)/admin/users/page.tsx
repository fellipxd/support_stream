import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { hasPermission } from '@/server/authz/policy';
import { prisma } from '@/server/db/client';
import { formatRelative } from '@/lib/format';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives';

export const metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const admin = await requireUser();
  if (!hasPermission(admin, 'user.manage')) redirect('/dashboard');

  const users = await prisma.user.findMany({
    include: { roles: true, _count: { select: { reportedTickets: true } } },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Access"
        title="Users"
        description={`${users.length} accounts. Roles determine what each person can do.`}
      />

      <div className="mt-6">
        <Card>
          <CardHeader title="Accounts" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Roles
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Reported
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Last sign-in
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-2.5">
                      <span className="font-medium text-ink-900">{user.name}</span>
                      <span className="block text-xs text-ink-500">{user.email}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role.id}>{role.role.replace(/_/g, ' ').toLowerCase()}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={user.status === 'ACTIVE' ? 'text-emerald-700' : 'text-rose-600'}
                      >
                        {user.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-600">{user._count.reportedTickets}</td>
                    <td className="px-5 py-2.5 text-xs text-ink-500">
                      {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
