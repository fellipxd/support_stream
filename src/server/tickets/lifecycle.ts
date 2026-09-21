import type { RoleName, Ticket, TicketStatus } from '@prisma/client';
import { InvalidTransitionError } from '@/lib/errors';
import type { Actor } from '../authz/actor';
import { can } from '../authz/policy';

/**
 * The ticket state machine (docs/TICKET_LIFECYCLE.md). A closed table: anything not listed
 * here is rejected, including transitions that merely look harmless.
 */

export type ActorClass = 'reporter' | 'support' | 'qa' | 'developer' | 'lead' | 'admin' | 'system';

type TransitionRule = {
  to: TicketStatus;
  actors: ActorClass[];
  /** Additional preconditions evaluated against the ticket. */
  guard?: (ticket: Ticket, context: TransitionContext) => string | null;
};

export type TransitionContext = {
  reopenWindowDays: number;
  now: Date;
  /** Provided by the caller when the transition itself supplies the missing value. */
  incoming?: Partial<Pick<Ticket, 'supportOwnerId' | 'developerId' | 'rejectionReason'>>;
  hasDuplicateOf?: boolean;
};

const STAFF: ActorClass[] = ['support', 'qa', 'lead', 'admin'];

function requireTriageFields(ticket: Ticket, ctx: TransitionContext): string | null {
  if (!ticket.categoryId) return 'A category must be set before the ticket can be assigned';
  const supportOwner = ctx.incoming?.supportOwnerId ?? ticket.supportOwnerId;
  if (!supportOwner) return 'A support owner must be assigned first';
  return null;
}

function requireDeveloper(ticket: Ticket, ctx: TransitionContext): string | null {
  const dev = ctx.incoming?.developerId ?? ticket.developerId;
  return dev ? null : 'A developer must be assigned before the ticket can be ready for QA';
}

export const TRANSITIONS: Record<TicketStatus, TransitionRule[]> = {
  NEW: [
    { to: 'TRIAGE', actors: STAFF },
    {
      to: 'DUPLICATE',
      actors: STAFF,
      guard: (_t, c) => (c.hasDuplicateOf ? null : 'A primary ticket must be linked'),
    },
    {
      to: 'REJECTED',
      actors: ['lead', 'admin'],
      guard: (t, c) =>
        (c.incoming?.rejectionReason ?? t.rejectionReason) ? null : 'A reason is required',
    },
    { to: 'CANCELLED', actors: ['reporter', 'lead', 'admin'] },
  ],
  TRIAGE: [
    { to: 'ASSIGNED', actors: STAFF, guard: requireTriageFields },
    { to: 'IN_PROGRESS', actors: STAFF },
    { to: 'WAITING_FOR_USER', actors: STAFF },
    {
      to: 'DUPLICATE',
      actors: STAFF,
      guard: (_t, c) => (c.hasDuplicateOf ? null : 'A primary ticket must be linked'),
    },
    {
      to: 'REJECTED',
      actors: ['lead', 'admin'],
      guard: (t, c) =>
        (c.incoming?.rejectionReason ?? t.rejectionReason) ? null : 'A reason is required',
    },
    { to: 'CANCELLED', actors: ['reporter', 'lead', 'admin'] },
  ],
  ASSIGNED: [
    { to: 'IN_PROGRESS', actors: [...STAFF, 'developer'] },
    { to: 'WAITING_FOR_USER', actors: STAFF },
    { to: 'WAITING_FOR_DEVELOPER', actors: STAFF, guard: requireDeveloper },
    { to: 'TRIAGE', actors: STAFF },
    { to: 'CANCELLED', actors: ['lead', 'admin'] },
  ],
  IN_PROGRESS: [
    { to: 'WAITING_FOR_USER', actors: STAFF },
    { to: 'WAITING_FOR_DEVELOPER', actors: STAFF, guard: requireDeveloper },
    { to: 'READY_FOR_QA', actors: [...STAFF, 'developer'], guard: requireDeveloper },
    { to: 'RESOLVED', actors: ['support', 'qa', 'lead', 'admin'] },
    { to: 'CANCELLED', actors: ['lead', 'admin'] },
  ],
  WAITING_FOR_USER: [
    { to: 'TRIAGE', actors: [...STAFF, 'system'] },
    { to: 'IN_PROGRESS', actors: [...STAFF, 'system'] },
    { to: 'CANCELLED', actors: ['reporter', 'lead', 'admin'] },
  ],
  WAITING_FOR_DEVELOPER: [
    { to: 'IN_PROGRESS', actors: [...STAFF, 'developer'] },
    { to: 'READY_FOR_QA', actors: [...STAFF, 'developer'], guard: requireDeveloper },
    { to: 'WAITING_FOR_USER', actors: STAFF },
  ],
  READY_FOR_QA: [
    { to: 'QA_VERIFICATION', actors: ['qa', 'lead', 'admin'] },
    { to: 'IN_PROGRESS', actors: [...STAFF, 'developer'] },
  ],
  QA_VERIFICATION: [
    { to: 'RESOLVED', actors: ['qa', 'support', 'lead', 'admin'] },
    { to: 'IN_PROGRESS', actors: STAFF },
    { to: 'WAITING_FOR_DEVELOPER', actors: STAFF, guard: requireDeveloper },
  ],
  RESOLVED: [
    { to: 'CLOSED', actors: ['reporter', ...STAFF, 'system'] },
    {
      to: 'REOPENED',
      actors: ['reporter', ...STAFF],
      guard: (ticket, ctx) => {
        // Staff may always reopen; the window applies to reporters (enforced in the service).
        if (!ticket.resolvedAt) return null;
        const days = (ctx.now.getTime() - ticket.resolvedAt.getTime()) / 86_400_000;
        return days <= ctx.reopenWindowDays ? null : 'The reopen window for this ticket has passed';
      },
    },
  ],
  CLOSED: [
    {
      to: 'REOPENED',
      actors: ['reporter', ...STAFF],
      guard: (ticket, ctx) => {
        if (!ticket.closedAt) return null;
        const days = (ctx.now.getTime() - ticket.closedAt.getTime()) / 86_400_000;
        return days <= ctx.reopenWindowDays ? null : 'The reopen window for this ticket has passed';
      },
    },
  ],
  REOPENED: [
    { to: 'TRIAGE', actors: STAFF },
    { to: 'IN_PROGRESS', actors: STAFF },
    { to: 'WAITING_FOR_USER', actors: STAFF },
  ],
  DUPLICATE: [],
  REJECTED: [],
  CANCELLED: [],
};

/** The actor classes a given actor may act as for this ticket. */
export function actorClasses(actor: Actor, ticket: Ticket): ActorClass[] {
  if (actor.kind === 'system') return ['system'];
  const classes: ActorClass[] = [];
  if (actor.kind === 'guest') {
    if (actor.ticketId === ticket.id) classes.push('reporter');
    return classes;
  }
  if (ticket.reporterUserId === actor.id) classes.push('reporter');
  const roles: RoleName[] = actor.roles;
  if (roles.includes('SUPPORT_AGENT')) classes.push('support');
  if (roles.includes('QA')) classes.push('qa');
  if (roles.includes('DEVELOPER') && ticket.developerId === actor.id) classes.push('developer');
  if (roles.includes('SUPPORT_LEAD') || roles.includes('QA_LEAD')) classes.push('lead');
  if (roles.includes('ADMIN') || roles.includes('SUPER_ADMIN')) classes.push('admin');
  return classes;
}

export type TransitionCheck = { allowed: true } | { allowed: false; reason: string };

export function checkTransition(
  actor: Actor,
  ticket: Ticket,
  to: TicketStatus,
  ctx: TransitionContext,
): TransitionCheck {
  if (ticket.status === to) return { allowed: true }; // idempotent no-op

  const rules = TRANSITIONS[ticket.status].filter((r) => r.to === to);
  if (rules.length === 0) {
    return { allowed: false, reason: `Cannot move a ticket from ${ticket.status} to ${to}` };
  }
  const classes = actorClasses(actor, ticket);
  const permitted = rules.filter((r) => r.actors.some((a) => classes.includes(a)));
  if (permitted.length === 0) {
    return { allowed: false, reason: 'Your role may not make this change' };
  }
  // The actor must also hold the transition permission (or be the reporter acting on their own).
  const isReporterAction =
    classes.includes('reporter') && ['CLOSED', 'REOPENED', 'CANCELLED'].includes(to);
  if (!isReporterAction && !can(actor, 'ticket.transition', ticket) && actor.kind !== 'system') {
    return { allowed: false, reason: 'Your role may not make this change' };
  }
  for (const rule of permitted) {
    const failure = rule.guard?.(ticket, ctx);
    if (!failure) return { allowed: true };
    // If every matching rule fails its guard, report the first failure.
    if (rule === permitted[permitted.length - 1]) return { allowed: false, reason: failure };
  }
  return { allowed: true };
}

export function assertTransition(
  actor: Actor,
  ticket: Ticket,
  to: TicketStatus,
  ctx: TransitionContext,
): void {
  const result = checkTransition(actor, ticket, to, ctx);
  if (!result.allowed) throw new InvalidTransitionError(ticket.status, to, result.reason);
}

/** Statuses the actor may currently move this ticket to — used to build the UI controls. */
export function availableTransitions(
  actor: Actor,
  ticket: Ticket,
  ctx: TransitionContext,
): TicketStatus[] {
  return TRANSITIONS[ticket.status]
    .map((r) => r.to)
    .filter((to, i, arr) => arr.indexOf(to) === i)
    .filter((to) => checkTransition(actor, ticket, to, ctx).allowed);
}

export const TERMINAL: TicketStatus[] = ['CLOSED', 'DUPLICATE', 'REJECTED', 'CANCELLED'];
export function isTerminal(status: TicketStatus): boolean {
  return TERMINAL.includes(status);
}
