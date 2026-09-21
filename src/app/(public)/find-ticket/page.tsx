import { LinkButton } from '@/components/ui/primitives';

export const metadata = { title: 'Find your ticket' };

/**
 * Deliberately does not accept a ticket ID: a ticket key alone must never grant access
 * (docs/SECURITY_MODEL.md T2). Access is only ever via the emailed secure link or an account.
 */
export default function FindTicketPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <div className="rounded-xl border border-ink-200 bg-white p-6 sm:p-8">
        <h1 className="text-xl font-bold text-ink-900">Looking for a ticket you reported?</h1>
        <p className="mt-3 text-sm text-ink-600">
          For your security we do not open tickets from a reference number alone — anyone who
          guessed the number could then read your report.
        </p>

        <div className="mt-6 space-y-4 text-sm text-ink-600">
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
            <h2 className="font-semibold text-ink-900">If you reported as a guest</h2>
            <p className="mt-1">
              Open the secure link in the acknowledgement email we sent you. Every update email
              contains a fresh link. Check your spam folder if you cannot find it.
            </p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
            <h2 className="font-semibold text-ink-900">If you have an account</h2>
            <p className="mt-1">Sign in and every ticket you have reported is on your dashboard.</p>
            <div className="mt-3">
              <LinkButton href="/sign-in" size="sm">
                Sign in
              </LinkButton>
            </div>
          </div>
        </div>

        <p className="mt-6 text-sm text-ink-600">
          Still stuck?{' '}
          <a className="font-medium text-brand-600 underline" href="/report">
            Report the issue again
          </a>{' '}
          and mention your original reference — we will link the two.
        </p>
      </div>
    </div>
  );
}
