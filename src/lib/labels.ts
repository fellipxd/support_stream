import type { Priority, Severity, TicketStatus, CommentVisibility } from '@prisma/client';

/** Centralised display copy. Keeps terminology consistent and i18n-ready. */
export const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'New',
  TRIAGE: 'Triage',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  WAITING_FOR_USER: 'Waiting for you',
  WAITING_FOR_DEVELOPER: 'Waiting for developer',
  READY_FOR_QA: 'Ready for QA',
  QA_VERIFICATION: 'QA verification',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  DUPLICATE: 'Duplicate',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const STATUS_TONE: Record<TicketStatus, string> = {
  NEW: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  TRIAGE: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  ASSIGNED: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  IN_PROGRESS: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  WAITING_FOR_USER: 'bg-orange-50 text-orange-800 ring-orange-600/20',
  WAITING_FOR_DEVELOPER: 'bg-orange-50 text-orange-800 ring-orange-600/20',
  READY_FOR_QA: 'bg-cyan-50 text-cyan-800 ring-cyan-600/20',
  QA_VERIFICATION: 'bg-teal-50 text-teal-800 ring-teal-600/20',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CLOSED: 'bg-ink-100 text-ink-700 ring-ink-500/20',
  REOPENED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  DUPLICATE: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  REJECTED: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  CANCELLED: 'bg-ink-100 text-ink-600 ring-ink-500/20',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  S1_CRITICAL: 'S1 Critical',
  S2_HIGH: 'S2 High',
  S3_MEDIUM: 'S3 Medium',
  S4_LOW: 'S4 Low',
};

export const SEVERITY_HELP: Record<Severity, string> = {
  S1_CRITICAL: 'System unavailable or severe business impact',
  S2_HIGH: 'Major functionality unavailable',
  S3_MEDIUM: 'Function impaired but a workaround exists',
  S4_LOW: 'Minor or cosmetic issue',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  P0_EMERGENCY: 'P0 Emergency',
  P1_URGENT: 'P1 Urgent',
  P2_NORMAL: 'P2 Normal',
  P3_LOW: 'P3 Low',
};

export const VISIBILITY_LABEL: Record<CommentVisibility, string> = {
  PUBLIC: 'Public comment',
  INTERNAL: 'Internal note',
  QA_NOTE: 'QA note',
  DEV_NOTE: 'Developer note',
  SYSTEM: 'System event',
};

/** Statuses a reporter is told about by email. */
export const REPORTER_VISIBLE_STATUSES: TicketStatus[] = [
  'WAITING_FOR_USER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'REJECTED',
  'CANCELLED',
  'DUPLICATE',
];

export const OPEN_STATUSES: TicketStatus[] = [
  'NEW',
  'TRIAGE',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_DEVELOPER',
  'READY_FOR_QA',
  'QA_VERIFICATION',
  'REOPENED',
];

export const TERMINAL_STATUSES: TicketStatus[] = ['CLOSED', 'DUPLICATE', 'REJECTED', 'CANCELLED'];
