import { prisma } from '@/server/db/client';
import { LinkButton } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/reveal';

export const metadata = { title: 'How can we help?' };

const STEPS = [
  ['01', 'You report', 'Takes about a minute. Screenshots help.'],
  ['02', 'We acknowledge', 'You get a ticket reference by email straight away.'],
  ['03', 'We investigate', 'Support, QA and engineering work the ticket.'],
  ['04', 'You are told', 'We email you when it is resolved.'],
] as const;

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
      {/* Hero. The entrance is pure CSS so it plays without JavaScript and is neutralised
          by the global prefers-reduced-motion rule. */}
      <section className="on-dark relative isolate overflow-hidden bg-brand-900">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(75%_120%_at_12%_0%,var(--color-brand-700)_0%,transparent_58%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 -z-10 h-px bg-gradient-to-r from-transparent via-accent-500 to-transparent"
        />
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="animate-fade-in text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-300">
            Support Portal
          </p>
          <h1 className="mt-4 max-w-2xl animate-slide-up font-display text-4xl font-semibold leading-[1.1] tracking-tight text-white [animation-delay:80ms] sm:text-5xl">
            How can we help?
          </h1>
          <p className="mt-5 max-w-xl animate-slide-up text-base leading-relaxed text-brand-200 [animation-delay:160ms]">
            Tell us what went wrong and we will track it through to a fix. You will get a ticket
            reference and email updates — no account needed.
          </p>
          <div className="mt-9 flex animate-slide-up flex-col gap-3 [animation-delay:240ms] sm:flex-row">
            <LinkButton href="/report" variant="inverse" className="w-full sm:w-auto">
              Report an issue
            </LinkButton>
            <LinkButton href="/find-ticket" variant="outlineInverse" className="w-full sm:w-auto">
              Already reported an issue?
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16">
        <Reveal>
          <h2 className="rule-accent text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-600">
            Managed products
          </h2>
        </Reveal>
        <Reveal delay={90}>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {portals.map((portal) => (
              <li
                key={portal.id}
                className="group relative overflow-hidden rounded-xl border border-ink-200 bg-white p-4 shadow-xs transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md"
              >
                <h3 className="text-sm font-semibold tracking-tight text-ink-900">{portal.name}</h3>
                {portal.description ? (
                  <p className="mt-1 text-sm text-ink-500">{portal.description}</p>
                ) : null}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent-500 transition-transform duration-200 ease-out group-hover:scale-x-100"
                />
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <Reveal>
          <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-xs sm:p-8">
            <h2 className="rule-accent font-display text-xl font-semibold tracking-tight text-ink-900">
              What happens after you report
            </h2>
            <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(([step, title, body]) => (
                <li key={step} className="border-t border-ink-200 pt-4">
                  <span
                    aria-hidden="true"
                    className="font-display text-sm font-semibold tabular-nums tracking-widest text-accent-600"
                  >
                    {step}
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-ink-900">{title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-600">{body}</span>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </section>
    </>
  );
}
