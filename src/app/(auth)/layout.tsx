import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white"
          >
            S
          </span>
          Support Portal
        </Link>
      </header>
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12"
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
