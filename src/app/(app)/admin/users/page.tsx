import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { hasPermission } from '@/server/authz/policy';
import { prisma } from '@/server/db/client';
import { formatRelative } from '@/lib/format';
import { Badge, Card, CardHeader } from '@/components/ui/primitives';

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
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Users</h1>
      <p className="mt-1 text-sm text-slate-600">
        {users.length} accounts. Roles determine what each person can do.
      </p>

      <div className="mt-5">
        <Card>
          <CardHeader title="Accounts" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
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
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-2.5">
                      <span className="font-medium text-slate-900">{user.name}</span>
                      <span className="block text-xs text-slate-400">{user.email}</span>
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
                        className={user.status === 'ACTIVE' ? 'text-emerald-600' : 'text-rose-600'}
                      >
                        {user.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{user._count.reportedTickets}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500">
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
