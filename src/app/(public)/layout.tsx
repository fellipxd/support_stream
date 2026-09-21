import Link from 'next/link';
import { getSessionUser } from '@/server/auth/session';
import { BrandMark } from '@/components/ui/brand-mark';
import { LinkButton } from '@/components/ui/primitives';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/85 backdrop-blur-sm">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6"
        >
          <BrandMark />
          <div className="flex items-center gap-1 text-sm sm:gap-3">
            <Link
              href="/report"
              className="rounded-lg px-2.5 py-1.5 font-medium text-ink-600 transition-colors duration-150 ease-out hover:bg-ink-100 hover:text-ink-900"
            >
              Report an issue
            </Link>
            {user ? (
              <LinkButton href="/dashboard" size="sm">
                Dashboard
              </LinkButton>
            ) : (
              <LinkButton href="/sign-in" variant="dark" size="sm">
                Sign in
              </LinkButton>
            )}
          </div>
        </nav>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <p className="text-xs leading-relaxed text-ink-500">
            Support Portal — the single place to report and track issues with our products.
          </p>
        </div>
      </footer>
    </div>
  );
}
