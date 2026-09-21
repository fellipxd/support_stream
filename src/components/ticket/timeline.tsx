import type { CommentVisibility } from '@prisma/client';
import { renderMarkdown } from '@/lib/markdown';
import { formatDateTime, formatRelative, initials } from '@/lib/format';
import { STATUS_LABEL, VISIBILITY_LABEL } from '@/lib/labels';
import { Badge } from '@/components/ui/primitives';

export type TimelineComment = {
  kind: 'comment';
  id: string;
  createdAt: Date;
  visibility: CommentVisibility;
  bodyMarkdown: string;
  authorName: string;
  attachments: { id: string; filename: string; sizeBytes: number }[];
};

export type TimelineEvent = {
  kind: 'event';
  id: string;
  createdAt: Date;
  actorLabel: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
};

export type TimelineItem = TimelineComment | TimelineEvent;

const VISIBILITY_STYLE: Record<CommentVisibility, { ring: string; tone: string }> = {
  PUBLIC: {
    ring: 'border-slate-200 bg-white',
    tone: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  },
  INTERNAL: {
    ring: 'border-amber-200 bg-amber-50/60',
    tone: 'bg-amber-100 text-amber-800 ring-amber-600/20',
  },
  QA_NOTE: {
    ring: 'border-teal-200 bg-teal-50/60',
    tone: 'bg-teal-100 text-teal-800 ring-teal-600/20',
  },
  DEV_NOTE: {
    ring: 'border-violet-200 bg-violet-50/60',
    tone: 'bg-violet-100 text-violet-800 ring-violet-600/20',
  },
  SYSTEM: {
    ring: 'border-slate-200 bg-slate-50',
    tone: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  },
};

function humanValue(value: string | null): string {
  if (!value) return '—';
  const known = STATUS_LABEL[value as keyof typeof STATUS_LABEL];
  return known ?? value.replace(/_/g, ' ').toLowerCase();
}

function describe(event: TimelineEvent): string {
  switch (event.action) {
    case 'ticket.created':
      return `reported this issue (${event.newValue ?? ''})`;
    case 'status.changed':
      return `changed status from ${humanValue(event.oldValue)} to ${humanValue(event.newValue)}`;
    case 'ticket.triaged':
      return `set ${event.field} to ${humanValue(event.newValue)}`;
    case 'ticket.routed':
      return `routed this ticket to ${event.newValue ?? 'a project'}`;
    case 'assignment.support':
      return event.newValue
        ? `assigned ${event.newValue} as support owner`
        : 'removed the support owner';
    case 'assignment.qa':
      return event.newValue ? `assigned ${event.newValue} as QA owner` : 'removed the QA owner';
    case 'assignment.engineering':
      return event.newValue ? `assigned ${event.newValue} as developer` : 'removed the developer';
    case 'attachment.added':
      return `attached ${event.newValue}`;
    case 'comment.added':
      return 'added a comment';
    case 'status.note':
      return `noted: ${event.newValue ?? ''}`;
    default:
      return event.action.replace(/[._]/g, ' ');
  }
}

/** The ticket's conversation and its immutable activity trail, interleaved chronologically. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-slate-500">No activity yet.</p>;
  }

  return (
    <ol className="divide-y divide-slate-100">
      {items.map((item) =>
        item.kind === 'event' ? (
          <li key={item.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
            <span
              aria-hidden="true"
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"
            />
            <p className="text-slate-500">
              <span className="font-medium text-slate-700">{item.actorLabel}</span> {describe(item)}
              <time
                dateTime={item.createdAt.toISOString()}
                className="ml-1.5 text-xs text-slate-400"
              >
                {formatRelative(item.createdAt)}
              </time>
            </p>
          </li>
        ) : (
          <li key={item.id} className="px-5 py-4">
            <article className={`rounded-xl border p-4 ${VISIBILITY_STYLE[item.visibility].ring}`}>
              <header className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white"
                >
                  {initials(item.authorName)}
                </span>
                <span className="text-sm font-semibold text-slate-900">{item.authorName}</span>
                {item.visibility !== 'PUBLIC' ? (
                  <Badge tone={VISIBILITY_STYLE[item.visibility].tone}>
                    {VISIBILITY_LABEL[item.visibility]}
                  </Badge>
                ) : null}
                <time
                  dateTime={item.createdAt.toISOString()}
                  className="ml-auto text-xs text-slate-400"
                >
                  {formatDateTime(item.createdAt)}
                </time>
              </header>
              <div
                className="prose-comment"
                // Markup is produced by our own allow-list renderer in lib/markdown.ts, which
                // escapes all user input before re-introducing a fixed set of constructs.
                dangerouslySetInnerHTML={{ __html: renderMarkdown(item.bodyMarkdown) }}
              />
              {item.attachments.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {item.attachments.map((file) => (
                    <li key={file.id}>
                      <a
                        href={`/api/attachments/${file.id}/link`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        >
                          <path
                            d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.48-8.49"
                            strokeLinecap="round"
                          />
                        </svg>
                        {file.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          </li>
        ),
      )}
    </ol>
  );
}
