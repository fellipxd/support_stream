import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { prisma } from '@/server/db/client';
import { markNotificationsReadAction } from '@/app/actions/tickets';
import { formatRelative } from '@/lib/format';
import { Button, Card, CardHeader, EmptyState } from '@/components/ui/primitives';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requireUser();
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      include: { ticket: { select: { key: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Notifications</h1>
      <p className="mt-1 text-sm text-slate-600">
        {unread > 0 ? `${unread} unread.` : 'You are all caught up.'}
      </p>

      <div className="mt-5">
        <Card>
          <CardHeader
            title="Recent"
            action={
              unread > 0 ? (
                <form action={markNotificationsReadAction}>
                  <Button type="submit" size="sm" variant="secondary">
                    Mark all as read
                  </Button>
                </form>
              ) : undefined
            }
          />
          {notifications.length === 0 ? (
            <EmptyState
              title="No notifications yet"
              description="You will be notified here when a ticket is assigned to you or one you follow is updated."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((notification) => {
                const body = (
                  <div
                    className={`flex gap-3 px-5 py-3 ${notification.readAt ? '' : 'bg-brand-50/40'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? 'bg-slate-200' : 'bg-brand-600'}`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {notification.title}
                        {notification.readAt ? null : <span className="sr-only"> (unread)</span>}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-slate-600">{notification.body}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatRelative(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                );
                return (
                  <li key={notification.id}>
                    {notification.ticket ? (
                      <Link
                        href={`/tickets/${notification.ticket.key}`}
                        className="block hover:bg-slate-50"
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
