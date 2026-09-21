import { LinkButton } from '@/components/ui/primitives';

export const metadata = { title: 'Link no longer valid' };

export default function LinkExpiredPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6 text-center">
      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <h1 className="text-xl font-bold text-slate-900">This link is no longer valid</h1>
        <p className="mt-3 text-sm text-slate-600">
          Secure ticket links expire, and each one can only be opened once. The most recent email we
          sent you about the ticket will contain a working link.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <LinkButton href="/find-ticket">What can I do?</LinkButton>
          <LinkButton href="/" variant="secondary">
            Back to the portal
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
