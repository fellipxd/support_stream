import type { Prisma, Ticket } from '@prisma/client';
import { ForbiddenError } from '@/lib/errors';
import type { Actor } from './actor';
import {
  GUEST_PERMISSIONS,
  scopeForRoles,
  STAFF_ROLES,
  type Permission,
  type Scope,
} from './permissions';

/**
 * The only place authorisation decisions are made (docs/RBAC.md §3).
 * Components and route handlers call these; they never re-implement a rule.
 */

type TicketLike = Pick<
  Ticket,
  'id' | 'reporterUserId' | 'guestReporterId' | 'supportOwnerId' | 'qaOwnerId' | 'developerId'
>;

export function isStaff(actor: Actor): boolean {
  return actor.kind === 'user' && actor.roles.some((r) => STAFF_ROLES.includes(r));
}

export function permissionScope(actor: Actor, permission: Permission): Scope | null {
  if (actor.kind === 'system') return 'all';
  if (actor.kind === 'guest') return GUEST_PERMISSIONS.includes(permission) ? 'own' : null;
  return scopeForRoles(actor.roles, permission);
}

/** Does the actor hold the permission at all (ignoring a specific resource)? */
export function hasPermission(actor: Actor, permission: Permission): boolean {
  return permissionScope(actor, permission) !== null;
}

/** Does the actor hold the permission *for this ticket*? */
export function can(actor: Actor, permission: Permission, ticket?: TicketLike): boolean {
  const scope = permissionScope(actor, permission);
  if (!scope) return false;
  if (!ticket) return true;

  if (actor.kind === 'system') return true;
  if (actor.kind === 'guest') {
    // A guest session is bound to exactly one ticket. Nothing else is reachable.
    return actor.ticketId === ticket.id;
  }
  if (scope === 'all') return true;
  if (scope === 'assigned') {
    return (
      ticket.supportOwnerId === actor.id ||
      ticket.qaOwnerId === actor.id ||
      ticket.developerId === actor.id ||
      ticket.reporterUserId === actor.id
    );
  }
  return ticket.reporterUserId === actor.id;
}

export function requirePermission(actor: Actor, permission: Permission, ticket?: TicketLike): void {
  if (!can(actor, permission, ticket)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

/**
 * The SQL predicate that limits a list query to what the actor may see.
 * Filtering happens in the database, never after fetching — this is what makes list-level
 * IDOR structurally impossible (docs/SECURITY_MODEL.md T1).
 */
export function ticketScopeWhere(actor: Actor): Prisma.TicketWhereInput {
  if (actor.kind === 'system') return {};
  if (actor.kind === 'guest') return { id: actor.ticketId };

  const scope = permissionScope(actor, 'ticket.read.any');
  if (scope === 'all') return { archivedAt: null };
  if (scope === 'assigned') {
    return {
      archivedAt: null,
      OR: [
        { supportOwnerId: actor.id },
        { qaOwnerId: actor.id },
        { developerId: actor.id },
        { reporterUserId: actor.id },
      ],
    };
  }
  // Plain registered users: only what they reported.
  return { archivedAt: null, reporterUserId: actor.id };
}

/** Comment visibilities the actor may read on a ticket they can already see. */
export function visibleCommentVisibilities(
  actor: Actor,
  ticket?: TicketLike,
): Array<'PUBLIC' | 'INTERNAL' | 'QA_NOTE' | 'DEV_NOTE' | 'SYSTEM'> {
  if (can(actor, 'comment.read.internal', ticket)) {
    return ['PUBLIC', 'INTERNAL', 'QA_NOTE', 'DEV_NOTE', 'SYSTEM'];
  }
  return ['PUBLIC', 'SYSTEM'];
}

/** Can the actor author a comment at this visibility on this ticket? */
export function canComment(
  actor: Actor,
  visibility: 'PUBLIC' | 'INTERNAL' | 'QA_NOTE' | 'DEV_NOTE' | 'SYSTEM',
  ticket: TicketLike,
): boolean {
  if (visibility === 'SYSTEM') return actor.kind === 'system';
  if (visibility === 'PUBLIC') return can(actor, 'comment.create.public', ticket);
  return can(actor, 'comment.create.internal', ticket);
}
