import Link from 'next/link';
import { getSessionUser } from '@/server/auth/session';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6"
        >
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm text-white"
            >
              S
            </span>
            <span className="text-sm">Support Portal</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/report" className="font-medium text-slate-600 hover:text-slate-900">
              Report an issue
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/sign-in"
                className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5 text-xs text-slate-500 sm:px-6">
          Support Portal — the single place to report and track issues with our products.
        </div>
      </footer>
    </div>
  );
}
