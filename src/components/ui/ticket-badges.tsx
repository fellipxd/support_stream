import type { Priority, Severity, TicketStatus } from '@prisma/client';
import { PRIORITY_LABEL, SEVERITY_LABEL, STATUS_LABEL, STATUS_TONE } from '@/lib/labels';
import { Badge } from './primitives';

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

const SEVERITY_TONE: Record<Severity, string> = {
  S1_CRITICAL: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  S2_HIGH: 'bg-orange-50 text-orange-800 ring-orange-600/20',
  S3_MEDIUM: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  S4_LOW: 'bg-ink-100 text-ink-700 ring-ink-500/20',
};

const PRIORITY_TONE: Record<Priority, string> = {
  P0_EMERGENCY: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  P1_URGENT: 'bg-orange-50 text-orange-800 ring-orange-600/20',
  P2_NORMAL: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  P3_LOW: 'bg-ink-100 text-ink-700 ring-ink-500/20',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}
