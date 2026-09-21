import Link from 'next/link';
import { prisma } from '@/server/db/client';
import { LinkButton } from '@/components/ui/primitives';

export const metadata = { title: 'How can we help?' };

/**
 * Public landing page. Deliberately sparse: two actions, and the products we support.
 * No internal organisational information is exposed here.
 */
export default async function LandingPage() {
  const portals = await prisma.portal.findMany({
    where: { isActive: true },
    select: { id: true, name: true, description: true },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            How can we help?
          </h1>
          <p className="mt-3 max-w-xl text-base text-slate-600">
            Tell us what went wrong and we will track it through to a fix. You will get a ticket
            reference and email updates — no account needed.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/report" className="w-full sm:w-auto">
              Report an issue
            </LinkButton>
            <Link
              href="/find-ticket"
              className="inline-flex w-full items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:w-auto"
            >
              Already reported an issue?
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Managed products
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {portals.map((portal) => (
            <li key={portal.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">{portal.name}</h3>
              {portal.description ? (
                <p className="mt-1 text-sm text-slate-500">{portal.description}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">What happens after you report</h2>
          <ol className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-4">
            {[
              ['1', 'You report', 'Takes about a minute. Screenshots help.'],
              ['2', 'We acknowledge', 'You get a ticket reference by email straight away.'],
              ['3', 'We investigate', 'Support, QA and engineering work the ticket.'],
              ['4', 'You are told', 'We email you when it is resolved.'],
            ].map(([step, title, body]) => (
              <li key={step} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
                >
                  {step}
                </span>
                <span>
                  <span className="block font-medium text-slate-900">{title}</span>
                  {body}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
