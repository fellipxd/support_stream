import Link from 'next/link';
import { getActor } from '@/server/auth/session';
import { isStaff } from '@/server/authz/policy';
import { AppNav } from '@/components/shell/app-nav';
import { BrandMark } from '@/components/ui/brand-mark';

/**
 * Ticket pages are reachable by staff, registered reporters and guests alike, so the shell
 * adapts: guests get a minimal header with no navigation into the rest of the application.
 */
export default async function TicketLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();

  if (actor?.kind === 'user') {
    return (
      <AppNav user={{ id: actor.id, name: actor.name, roles: actor.roles }} staff={isStaff(actor)}>
        {children}
      </AppNav>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <BrandMark />
          <Link
            href="/report"
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 transition-colors duration-150 ease-out hover:bg-ink-100 hover:text-ink-900"
          >
            Report another issue
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
