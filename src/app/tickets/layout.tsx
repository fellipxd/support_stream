import Link from 'next/link';
import { getActor } from '@/server/auth/session';
import { isStaff } from '@/server/authz/policy';
import { AppNav } from '@/components/shell/app-nav';

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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white"
            >
              S
            </span>
            Support Portal
          </Link>
          <Link href="/report" className="text-sm font-medium text-slate-600 hover:text-slate-900">
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
