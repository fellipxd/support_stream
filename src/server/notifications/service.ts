import type { NotificationType, Prisma, Ticket, TicketStatus } from '@prisma/client';
import type { Tx } from '../db/client';
import { enqueue } from '../jobs/queue';
import { getEnv } from '../config/env';
import type { TemplateData, TemplateName } from './templates';
import { generateToken, hashToken } from '../auth/tokens';
import { toPlainText } from '@/lib/markdown';

/**
 * The single dispatch point for every notification (docs/NOTIFICATION_ARCHITECTURE.md).
 * Nothing else in the codebase creates a Notification row or an email job.
 *
 * Invariants enforced here:
 *  - internal content never reaches a reporter,
 *  - the actor is never notified of their own action,
 *  - recipients are deduplicated,
 *  - rows are written in the caller's transaction (§41 — no partial history).
 */

export type TicketForNotification = Ticket & {
  portal: { name: string };
  category: { name: string } | null;
  guestReporter: { id: string; email: string; name: string } | null;
  reporterUser: { id: string; email: string; name: string } | null;
};

export type StaffRecipient = { userId: string; email: string; name: string };

export type DispatchInput = {
  ticket: TicketForNotification;
  type: NotificationType;
  /** Plain-text summary shown in-app and, where applicable, in email. Never internal content. */
  title: string;
  body: string;
  actorUserId?: string | null;
  /** Staff who should receive an in-app notification (and email where the event warrants it). */
  staff?: StaffRecipient[];
  /** Staff who should additionally receive an email. */
  emailStaff?: StaffRecipient[];
  staffTemplate?: TemplateName;
  /** Reporter email: omit entirely for internal-only events. */
  reporter?: { template: TemplateName; message?: string } | null;
  actorName?: string;
};

function ticketPath(key: string): string {
  return `${getEnv().APP_URL}/tickets/${key}`;
}

/** Creates a fresh single-use magic link so a guest can always reach their ticket. */
async function guestTicketUrl(tx: Tx, ticketId: string, key: string): Promise<string> {
  const raw = generateToken();
  await tx.guestAccessToken.create({
    data: {
      ticketId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + getEnv().GUEST_TOKEN_TTL_DAYS * 86_400_000),
    },
  });
  return `${getEnv().APP_URL}/t/${raw}?ref=${encodeURIComponent(key)}`;
}

function templateData(
  ticket: TicketForNotification,
  recipientName: string,
  url: string,
  message?: string,
  actorName?: string,
): TemplateData {
  return {
    recipientName,
    ticketKey: ticket.key,
    ticketTitle: ticket.title,
    status: ticket.status,
    portalName: ticket.portal.name,
    categoryName: ticket.category?.name,
    severity: ticket.severity,
    priority: ticket.priority,
    ticketUrl: url,
    message,
    actorName,
  };
}

async function queueEmail(
  tx: Tx,
  template: TemplateName,
  to: string,
  ticketId: string,
  data: TemplateData,
): Promise<void> {
  await enqueue(tx, 'email.send', {
    template,
    to,
    ticketId,
    data: data as unknown as Prisma.InputJsonValue,
  });
}

export async function dispatch(tx: Tx, input: DispatchInput): Promise<void> {
  const { ticket } = input;

  // ---- in-app notifications (staff only; reporters are emailed) -------------
  const seen = new Set<string>();
  for (const person of input.staff ?? []) {
    if (!person.userId || person.userId === input.actorUserId || seen.has(person.userId)) continue;
    seen.add(person.userId);
    await tx.notification.create({
      data: {
        userId: person.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        ticketId: ticket.id,
      },
    });
  }

  // ---- staff email ---------------------------------------------------------
  if (input.staffTemplate) {
    const emailed = new Set<string>();
    for (const person of input.emailStaff ?? []) {
      if (!person.email || person.userId === input.actorUserId || emailed.has(person.userId))
        continue;
      emailed.add(person.userId);
      await queueEmail(
        tx,
        input.staffTemplate,
        person.email,
        ticket.id,
        templateData(ticket, person.name, ticketPath(ticket.key), input.body, input.actorName),
      );
    }
  }

  // ---- reporter email ------------------------------------------------------
  if (input.reporter) {
    const guest = ticket.guestReporter;
    const user = ticket.reporterUser;
    if (guest) {
      const url = await guestTicketUrl(tx, ticket.id, ticket.key);
      await queueEmail(
        tx,
        input.reporter.template,
        guest.email,
        ticket.id,
        templateData(ticket, guest.name, url, input.reporter.message, input.actorName),
      );
    } else if (user && user.id !== input.actorUserId) {
      await queueEmail(
        tx,
        input.reporter.template,
        user.email,
        ticket.id,
        templateData(
          ticket,
          user.name,
          ticketPath(ticket.key),
          input.reporter.message,
          input.actorName,
        ),
      );
    }
  }
}

/** Statuses whose change is worth emailing the reporter about. */
const REPORTER_EMAIL_STATUSES: TicketStatus[] = [
  'WAITING_FOR_USER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'REJECTED',
  'CANCELLED',
  'DUPLICATE',
];

export function reporterTemplateForStatus(status: TicketStatus): TemplateName | null {
  if (!REPORTER_EMAIL_STATUSES.includes(status)) return null;
  switch (status) {
    case 'WAITING_FOR_USER':
      return 'information_requested';
    case 'RESOLVED':
      return 'ticket_resolved';
    case 'CLOSED':
      return 'ticket_closed';
    case 'REOPENED':
      return 'ticket_reopened';
    default:
      return 'ticket_updated';
  }
}

/** Public comment text is safe to email; anything else must never be passed here. */
export function commentPreview(bodyMarkdown: string): string {
  return toPlainText(bodyMarkdown, 400);
}
