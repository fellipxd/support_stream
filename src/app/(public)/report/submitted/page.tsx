import Link from 'next/link';
import { LinkButton } from '@/components/ui/primitives';

export const metadata = { title: 'Report received' };

/**
 * Confirmation. The one-time token is handed straight to the guest so they can open their
 * ticket now, without waiting for the acknowledgement email.
 */
export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; token?: string }>;
}) {
  const { key, token } = await searchParams;

  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center sm:p-8">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-6 w-6"
          >
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Thank you — we have your report</h1>
        <p className="mt-2 text-sm text-slate-600">
          Our support team has been notified and will review it shortly.
        </p>

        {key ? (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Your ticket reference
            </p>
            <p className="mt-1 font-mono text-xl font-bold tracking-wider text-slate-900">{key}</p>
          </div>
        ) : null}

        <p className="mt-5 text-sm text-slate-600">
          We have emailed you this reference along with a secure link to follow progress and reply.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {token ? <LinkButton href={`/t/${token}`}>Open your ticket</LinkButton> : null}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Back to the portal
          </Link>
        </div>
      </div>
    </div>
  );
}
