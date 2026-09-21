import type { Priority, Severity, TicketStatus } from '@prisma/client';
import { escapeHtml } from '@/lib/markdown';
import { PRIORITY_LABEL, SEVERITY_LABEL, STATUS_LABEL } from '@/lib/labels';

/**
 * Email templates (docs/NOTIFICATION_ARCHITECTURE.md §3). Pure functions, both HTML and text,
 * every interpolated value escaped. No user-controlled markup ever reaches an inbox.
 */
export type TemplateName =
  | 'ticket_received'
  | 'ticket_updated'
  | 'information_requested'
  | 'ticket_assigned'
  | 'new_comment'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'ticket_reopened'
  | 'sla_escalation';

export type TemplateData = {
  recipientName: string;
  ticketKey: string;
  ticketTitle: string;
  status: TicketStatus;
  portalName: string;
  ticketUrl: string;
  /** The change being communicated, already plain text. */
  message?: string;
  actorName?: string;
  severity?: Severity;
  priority?: Priority;
  categoryName?: string;
  supportOwnerName?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const BRAND = 'Support Portal';

function layout(
  data: TemplateData,
  heading: string,
  bodyHtml: string,
  cta = 'View ticket',
): string {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(data.ticketKey)} — ${e(heading)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
  <tr><td style="padding:20px 28px;background:#0f172a;color:#ffffff">
    <div style="font-size:15px;font-weight:600;letter-spacing:.2px">${e(BRAND)}</div>
  </td></tr>
  <tr><td style="padding:28px">
    <h1 style="margin:0 0 6px;font-size:20px;line-height:1.3">${e(heading)}</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#475569">Hello ${e(data.recipientName)},</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:0 0 20px">
      <tr><td style="padding:16px 18px">
        <div style="font-size:13px;color:#64748b;margin-bottom:4px">Ticket</div>
        <div style="font-size:17px;font-weight:700;letter-spacing:.4px;margin-bottom:8px">${e(data.ticketKey)}</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:12px">${e(data.ticketTitle)}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;color:#334155">
          <tr><td style="padding:2px 14px 2px 0;color:#64748b">Status</td><td style="font-weight:600">${e(STATUS_LABEL[data.status])}</td></tr>
          <tr><td style="padding:2px 14px 2px 0;color:#64748b">Portal</td><td>${e(data.portalName)}</td></tr>
          ${data.categoryName ? `<tr><td style="padding:2px 14px 2px 0;color:#64748b">Category</td><td>${e(data.categoryName)}</td></tr>` : ''}
          ${data.severity ? `<tr><td style="padding:2px 14px 2px 0;color:#64748b">Severity</td><td>${e(SEVERITY_LABEL[data.severity])}</td></tr>` : ''}
          ${data.priority ? `<tr><td style="padding:2px 14px 2px 0;color:#64748b">Priority</td><td>${e(PRIORITY_LABEL[data.priority])}</td></tr>` : ''}
        </table>
      </td></tr>
    </table>

    ${bodyHtml}

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px">
      <tr><td style="border-radius:8px;background:#1d4ed8">
        <a href="${e(data.ticketUrl)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${e(cta)}</a>
      </td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:12px;color:#94a3b8">This link is personal to you. Please do not forward it.</p>
  </td></tr>
  <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
    You are receiving this because you are involved with ticket ${e(data.ticketKey)}.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function textLayout(
  data: TemplateData,
  heading: string,
  lines: string[],
  cta = 'View ticket',
): string {
  return [
    `${BRAND} — ${heading}`,
    '',
    `Hello ${data.recipientName},`,
    '',
    `Ticket:   ${data.ticketKey}`,
    `Title:    ${data.ticketTitle}`,
    `Status:   ${STATUS_LABEL[data.status]}`,
    `Portal:   ${data.portalName}`,
    ...(data.severity ? [`Severity: ${SEVERITY_LABEL[data.severity]}`] : []),
    ...(data.priority ? [`Priority: ${PRIORITY_LABEL[data.priority]}`] : []),
    '',
    ...lines,
    '',
    `${cta}: ${data.ticketUrl}`,
    '',
    'This link is personal to you. Please do not forward it.',
  ].join('\n');
}

function para(text: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155">${escapeHtml(text)}</p>`;
}

function quote(text: string): string {
  return `<div style="margin:0 0 16px;padding:14px 16px;background:#f8fafc;border-left:3px solid #cbd5e1;border-radius:0 6px 6px 0;font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

type Renderer = (data: TemplateData) => RenderedEmail;

const TEMPLATES: Record<TemplateName, Renderer> = {
  ticket_received: (d) => ({
    subject: `[${d.ticketKey}] We have received your report`,
    html: layout(
      d,
      'We have received your report',
      para(
        'Thank you for letting us know. Your report has been logged and our support team will review it shortly.',
      ) +
        para('Please keep this ticket reference for any follow-up: ' + d.ticketKey + '.') +
        (d.message ? quote(d.message) : ''),
      'View your ticket',
    ),
    text: textLayout(
      d,
      'We have received your report',
      [
        'Thank you for letting us know. Your report has been logged and our support team will review it shortly.',
        `Please keep this ticket reference for any follow-up: ${d.ticketKey}.`,
      ],
      'View your ticket',
    ),
  }),

  ticket_updated: (d) => ({
    subject: `[${d.ticketKey}] Status updated: ${STATUS_LABEL[d.status]}`,
    html: layout(
      d,
      'Your ticket has been updated',
      para(d.message ?? 'The status of your ticket has changed.'),
    ),
    text: textLayout(d, 'Your ticket has been updated', [
      d.message ?? 'The status of your ticket has changed.',
    ]),
  }),

  information_requested: (d) => ({
    subject: `[${d.ticketKey}] We need a little more information`,
    html: layout(
      d,
      'We need a little more information',
      para('Our team needs some extra detail before they can continue investigating.') +
        (d.message ? quote(d.message) : '') +
        para('Please reply on the ticket — you can add screenshots or documents there too.'),
      'Reply on the ticket',
    ),
    text: textLayout(
      d,
      'We need a little more information',
      [
        'Our team needs some extra detail before they can continue investigating.',
        ...(d.message ? ['', d.message, ''] : []),
        'Please reply on the ticket — you can add screenshots or documents there too.',
      ],
      'Reply on the ticket',
    ),
  }),

  ticket_assigned: (d) => ({
    subject: `[${d.ticketKey}] Assigned to you — ${d.ticketTitle}`,
    html: layout(
      d,
      'You have been assigned a ticket',
      para(d.message ?? `${d.actorName ?? 'A colleague'} assigned this ticket to you.`),
      'Open ticket',
    ),
    text: textLayout(
      d,
      'You have been assigned a ticket',
      [d.message ?? `${d.actorName ?? 'A colleague'} assigned this ticket to you.`],
      'Open ticket',
    ),
  }),

  new_comment: (d) => ({
    subject: `[${d.ticketKey}] New comment on your ticket`,
    html: layout(
      d,
      `New comment from ${d.actorName ?? 'the support team'}`,
      (d.message ? quote(d.message) : '') + para('You can reply directly on the ticket.'),
      'Reply on the ticket',
    ),
    text: textLayout(
      d,
      `New comment from ${d.actorName ?? 'the support team'}`,
      [...(d.message ? [d.message, ''] : []), 'You can reply directly on the ticket.'],
      'Reply on the ticket',
    ),
  }),

  ticket_resolved: (d) => ({
    subject: `[${d.ticketKey}] Resolved — ${d.ticketTitle}`,
    html: layout(
      d,
      'Your issue has been resolved',
      para('Our team has resolved this issue.') +
        (d.message ? quote(d.message) : '') +
        para(
          'Please confirm on the ticket if everything now works as expected. If the problem persists you can reopen the ticket there.',
        ),
      'Confirm or reopen',
    ),
    text: textLayout(
      d,
      'Your issue has been resolved',
      [
        'Our team has resolved this issue.',
        ...(d.message ? ['', d.message, ''] : []),
        'Please confirm on the ticket if everything now works as expected. If the problem persists you can reopen the ticket there.',
      ],
      'Confirm or reopen',
    ),
  }),

  ticket_closed: (d) => ({
    subject: `[${d.ticketKey}] Closed — ${d.ticketTitle}`,
    html: layout(
      d,
      'Your ticket has been closed',
      para(d.message ?? 'This ticket is now closed. Thank you for reporting the issue.'),
    ),
    text: textLayout(d, 'Your ticket has been closed', [
      d.message ?? 'This ticket is now closed. Thank you for reporting the issue.',
    ]),
  }),

  ticket_reopened: (d) => ({
    subject: `[${d.ticketKey}] Reopened — ${d.ticketTitle}`,
    html: layout(
      d,
      'This ticket has been reopened',
      para(d.message ?? 'The ticket is being looked at again.'),
    ),
    text: textLayout(d, 'This ticket has been reopened', [
      d.message ?? 'The ticket is being looked at again.',
    ]),
  }),

  sla_escalation: (d) => ({
    subject: `[${d.ticketKey}] SLA ${d.message?.includes('breach') ? 'breached' : 'warning'} — ${d.ticketTitle}`,
    html: layout(
      d,
      'SLA escalation',
      para(d.message ?? 'This ticket is approaching or has passed its service level target.') +
        (d.supportOwnerName ? para(`Support owner: ${d.supportOwnerName}`) : ''),
      'Open ticket',
    ),
    text: textLayout(
      d,
      'SLA escalation',
      [d.message ?? 'This ticket is approaching or has passed its service level target.'],
      'Open ticket',
    ),
  }),
};

export function renderEmail(template: TemplateName, data: TemplateData): RenderedEmail {
  const renderer = TEMPLATES[template];
  if (!renderer) throw new Error(`Unknown email template: ${template}`);
  return renderer(data);
}

export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as TemplateName[];
