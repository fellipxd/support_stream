import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/server/db/client';
import { getActor } from '@/server/auth/session';
import { can, isStaff } from '@/server/authz/policy';
import { getAttachments, getTicketByKey, getTimeline } from '@/server/tickets/service';
import { availableTransitions } from '@/server/tickets/lifecycle';
import { getEnv } from '@/server/config/env';
import { isAppError } from '@/lib/errors';
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/labels';
import { PriorityBadge, SeverityBadge, StatusBadge } from '@/components/ui/ticket-badges';
import { Card, CardHeader } from '@/components/ui/primitives';
import { Timeline, type TimelineItem } from '@/components/ticket/timeline';
import { CommentForm } from '@/components/ticket/comment-form';
import { StaffPanel } from '@/components/ticket/staff-panel';
import { ReporterActions } from '@/components/ticket/reporter-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: key.toUpperCase() };
}

/**
 * The ticket workspace (§14 of the brief). One page serves reporters, support, QA and
 * developers — what each sees is decided server-side by the policy layer, never by hiding
 * markup from a client that already received it.
 */
export default async function TicketPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const actor = await getActor();
  if (!actor) notFound();

  let ticket;
  try {
    ticket = await getTicketByKey(actor, key);
  } catch (error) {
    if (isAppError(error) && error.httpStatus === 404) notFound();
    throw error;
  }

  const [{ comments, activities }, attachments] = await Promise.all([
    getTimeline(actor, ticket.id),
    getAttachments(actor, ticket.id),
  ]);

  const staffView = isStaff(actor);
  const canInternal = can(actor, 'comment.read.internal', ticket);

  const items: TimelineItem[] = [
    ...comments.map((comment) => ({
      kind: 'comment' as const,
      id: comment.id,
      createdAt: comment.createdAt,
      visibility: comment.visibility,
      bodyMarkdown: comment.bodyMarkdown,
      authorName: comment.authorUser?.name ?? comment.guestReporter?.name ?? 'System',
      attachments: comment.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        sizeBytes: a.sizeBytes,
      })),
    })),
    ...activities.map((activity) => ({
      kind: 'event' as const,
      id: activity.id,
      createdAt: activity.createdAt,
      actorLabel: activity.actorLabel,
      action: activity.action,
      field: activity.field,
      oldValue: activity.oldValue,
      newValue: activity.newValue,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const [categories, support, qa, developers, sla] = staffView
    ? await Promise.all([
        prisma.ticketCategory.findMany({
          where: { portalId: ticket.portalId, isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true },
        }),
        prisma.user.findMany({
          where: { status: 'ACTIVE', roles: { some: { role: 'SUPPORT_AGENT' } } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        prisma.user.findMany({
          where: { status: 'ACTIVE', roles: { some: { role: 'QA' } } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        prisma.user.findMany({
          where: { status: 'ACTIVE', roles: { some: { role: 'DEVELOPER' } } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        prisma.slaInstance.findFirst({
          where: { ticketId: ticket.id },
          orderBy: { createdAt: 'desc' },
        }),
      ])
    : [[], [], [], [], null];

  const transitions = availableTransitions(actor, ticket, {
    reopenWindowDays: getEnv().REOPEN_WINDOW_DAYS,
    now: new Date(),
  });

  const reporterName = ticket.reporterUser?.name ?? ticket.guestReporter?.name ?? 'Unknown';
  const isReporter =
    (actor.kind === 'guest' && actor.ticketId === ticket.id) ||
    (actor.kind === 'user' && ticket.reporterUserId === actor.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        {staffView ? (
          <Link href="/queue" className="text-ink-500 hover:text-ink-900">
            ← Back to the queue
          </Link>
        ) : actor.kind === 'user' ? (
          <Link href="/dashboard" className="text-ink-500 hover:text-ink-900">
            ← My tickets
          </Link>
        ) : null}
      </nav>

      <header className="rounded-xl border border-ink-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold tracking-wider text-ink-500">
            {ticket.key}
          </span>
          <StatusBadge status={ticket.status} />
          <SeverityBadge severity={ticket.severity} />
          <PriorityBadge priority={ticket.priority} />
        </div>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
          {ticket.title}
        </h1>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {[
            ['Portal', ticket.portal.name],
            ['Category', ticket.category?.name ?? 'Uncategorised'],
            ['Reporter', reporterName],
            ['Reported', formatDateTime(ticket.createdAt)],
            ...(staffView
              ? ([
                  ['Support owner', ticket.supportOwner?.name ?? 'Unassigned'],
                  ['QA owner', ticket.qaOwner?.name ?? 'Unassigned'],
                  ['Developer', ticket.developer?.name ?? 'Unassigned'],
                  ['Project', ticket.project?.name ?? '—'],
                ] as const)
              : []),
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
              <dd className="mt-0.5 text-ink-800">{value}</dd>
            </div>
          ))}
        </dl>

        {staffView && sla ? (
          <div className="mt-4 flex flex-wrap gap-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
            <span>
              First response due{' '}
              <strong className="text-ink-700">{formatDateTime(sla.firstResponseDueAt)}</strong>
              {sla.firstResponseMetAt ? ' — met' : ''}
            </span>
            <span>
              Resolution due{' '}
              <strong className="text-ink-700">{formatDateTime(sla.resolutionDueAt)}</strong>
            </span>
            <span>
              SLA{' '}
              <strong className={sla.state === 'BREACHED' ? 'text-rose-600' : 'text-ink-700'}>
                {sla.state}
              </strong>
            </span>
          </div>
        ) : null}
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="What was reported" />
            <div className="space-y-4 px-5 py-4 text-sm">
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">
                  Description
                </h3>
                <p className="whitespace-pre-wrap text-ink-700">{ticket.description}</p>
              </div>
              {[
                ['What they were trying to do', ticket.whatTrying],
                ['What happened', ticket.whatHappened],
                ['What they expected', ticket.whatExpected],
              ]
                .filter(([, value]) => Boolean(value))
                .map(([label, value]) => (
                  <div key={label as string}>
                    <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">
                      {label}
                    </h3>
                    <p className="whitespace-pre-wrap text-ink-700">{value}</p>
                  </div>
                ))}
              {staffView && (ticket.browser || ticket.os || ticket.device || ticket.pageUrl) ? (
                <details className="rounded-lg bg-ink-50 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-ink-600">
                    Environment
                  </summary>
                  <dl className="mt-2 space-y-1 text-xs text-ink-600">
                    {[
                      ['Browser', ticket.browser],
                      ['Operating system', ticket.os],
                      ['Device', ticket.device],
                      ['Page', ticket.pageUrl],
                      ['Frequency', ticket.frequency],
                      ['Occurred at', ticket.occurredAt ? formatDateTime(ticket.occurredAt) : null],
                    ]
                      .filter(([, value]) => Boolean(value))
                      .map(([label, value]) => (
                        <div key={label as string} className="flex gap-2">
                          <dt className="w-32 shrink-0 text-ink-500">{label}</dt>
                          <dd className="break-all">{String(value)}</dd>
                        </div>
                      ))}
                  </dl>
                </details>
              ) : null}
            </div>
          </Card>

          {attachments.length > 0 ? (
            <Card>
              <CardHeader title={`Attachments (${attachments.length})`} />
              <ul className="divide-y divide-ink-100">
                {attachments.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <a
                        href={`/api/attachments/${file.id}/link`}
                        className="block truncate font-medium text-brand-600 hover:underline"
                      >
                        {file.filename}
                      </a>
                      <p className="text-xs text-ink-500">
                        {formatBytes(file.sizeBytes)} · {formatRelative(file.createdAt)}
                        {file.visibility === 'INTERNAL' ? ' · internal' : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Activity"
              description={canInternal ? 'Includes internal notes and system events.' : undefined}
            />
            <Timeline items={items} />
            <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-4">
              <CommentForm
                ticketId={ticket.id}
                canWriteInternal={can(actor, 'comment.create.internal', ticket)}
              />
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          {isReporter ? <ReporterActions ticketId={ticket.id} status={ticket.status} /> : null}

          {staffView ? (
            <StaffPanel
              ticketId={ticket.id}
              status={ticket.status}
              severity={ticket.severity}
              priority={ticket.priority}
              categoryId={ticket.categoryId}
              categories={categories}
              availableTransitions={transitions}
              people={{ support, qa, developers }}
              current={{
                supportOwnerId: ticket.supportOwnerId,
                qaOwnerId: ticket.qaOwnerId,
                developerId: ticket.developerId,
              }}
              permissions={{
                triage: can(actor, 'ticket.triage', ticket),
                assignSupport: can(actor, 'ticket.assign.support', ticket),
                assignQa: can(actor, 'ticket.assign.qa', ticket),
                assignDev: can(actor, 'ticket.assign.developer', ticket),
              }}
            />
          ) : (
            <div className="rounded-xl border border-ink-200 bg-white p-4 text-sm">
              <h3 className="font-semibold text-ink-900">Current status</h3>
              <p className="mt-1 text-ink-600">{STATUS_LABEL[ticket.status]}</p>
              <p className="mt-3 text-xs text-ink-500">
                We will email you whenever there is an update. You can reply on this page at any
                time.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
