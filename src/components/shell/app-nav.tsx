import Link from 'next/link';
import type { RoleName } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { signOutAction } from '@/app/actions/auth';
import { initials } from '@/lib/format';
import { BrandMark } from '@/components/ui/brand-mark';
import { Button } from '@/components/ui/primitives';

type Props = {
  children: React.ReactNode;
  user: { id: string; name: string; roles: RoleName[] };
  staff: boolean;
};

/** Navigation is derived from roles server-side; unauthorised routes also re-check. */
function navFor(roles: RoleName[], staff: boolean) {
  const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
  const isManager =
    isAdmin || roles.includes('HOD') || roles.includes('SUPPORT_LEAD') || roles.includes('QA_LEAD');

  const items: Array<{ href: string; label: string }> = [
    { href: '/dashboard', label: 'Dashboard' },
  ];
  if (staff) items.push({ href: '/queue', label: 'Ticket queue' });
  items.push({ href: '/dashboard/my-tickets', label: 'My tickets' });
  if (staff) items.push({ href: '/tickets', label: 'All tickets' });
  if (isManager) items.push({ href: '/reports', label: 'Reports' });
  if (isAdmin) items.push({ href: '/admin', label: 'Administration' });
  items.push({ href: '/notifications', label: 'Notifications' });
  if (!staff) items.push({ href: '/report', label: 'Report an issue' });
  return items;
}

export async function AppNav({ children, user, staff }: Props) {
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  const items = navFor(user.roles, staff);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <BrandMark href="/dashboard" hideLabelOnMobile />

          <nav aria-label="Main" className="min-w-0 flex-1">
            <ul className="flex items-center gap-0.5 overflow-x-auto text-sm">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="relative whitespace-nowrap rounded-lg px-2.5 py-1.5 font-medium text-ink-600 transition-colors duration-150 ease-out hover:bg-ink-100 hover:text-ink-900"
                  >
                    {item.label}
                    {item.href === '/notifications' && unread > 0 ? (
                      <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-md bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                        {unread > 99 ? '99+' : unread}
                        <span className="sr-only"> unread notifications</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/15"
              title={user.name}
            >
              {initials(user.name)}
            </span>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1 bg-ink-50">
        {children}
      </main>
    </div>
  );
}
