import type { RoleName } from '@prisma/client';

/**
 * The permission matrix from docs/RBAC.md, versioned in code so that it is reviewable,
 * diffable and unit-testable. Role *assignment* is data (UserRole); the rules are code.
 */
export const PERMISSIONS = [
  'ticket.create',
  'ticket.read.any',
  'ticket.list.queue',
  'ticket.triage',
  'ticket.assign.support',
  'ticket.assign.qa',
  'ticket.assign.developer',
  'ticket.reassign.any',
  'ticket.transition',
  'ticket.resolve',
  'ticket.close',
  'ticket.reopen',
  'ticket.relate',
  'ticket.escalate',
  'ticket.delete',
  'comment.create.public',
  'comment.create.internal',
  'comment.read.internal',
  'comment.edit.own',
  'attachment.upload',
  'attachment.download',
  'notification.read.own',
  'board.view',
  'report.view',
  'report.export',
  'config.portal.manage',
  'config.project.manage',
  'config.category.manage',
  'config.team.manage',
  'config.sla.manage',
  'config.routing.manage',
  'user.manage',
  'role.manage',
  'audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Scope of a granted permission:
 *  - 'all'      every ticket in the organisation
 *  - 'assigned' only tickets where the actor is support/QA owner or developer
 *  - 'own'      only tickets the actor reported
 */
export type Scope = 'all' | 'assigned' | 'own';

type RoleGrants = Partial<Record<Permission, Scope>>;

const USER: RoleGrants = {
  'ticket.create': 'own',
  'comment.create.public': 'own',
  'comment.edit.own': 'own',
  'attachment.upload': 'own',
  'attachment.download': 'own',
  'notification.read.own': 'all',
  'ticket.close': 'own',
  'ticket.reopen': 'own',
};

const DEVELOPER: RoleGrants = {
  ...USER,
  'ticket.read.any': 'assigned',
  'ticket.list.queue': 'assigned',
  'ticket.transition': 'assigned',
  'comment.create.public': 'assigned',
  'comment.create.internal': 'assigned',
  'comment.read.internal': 'assigned',
  'attachment.upload': 'assigned',
  'attachment.download': 'assigned',
  'board.view': 'all',
};

const SUPPORT_AGENT: RoleGrants = {
  ...USER,
  'ticket.read.any': 'all',
  'ticket.list.queue': 'all',
  'ticket.triage': 'all',
  'ticket.assign.support': 'all',
  'ticket.assign.qa': 'all',
  'ticket.assign.developer': 'all',
  'ticket.transition': 'all',
  'ticket.resolve': 'all',
  'ticket.close': 'all',
  'ticket.reopen': 'all',
  'ticket.relate': 'all',
  'ticket.escalate': 'all',
  'comment.create.public': 'all',
  'comment.create.internal': 'all',
  'comment.read.internal': 'all',
  'attachment.upload': 'all',
  'attachment.download': 'all',
  'board.view': 'all',
  'report.view': 'all',
};

const QA: RoleGrants = { ...SUPPORT_AGENT, 'ticket.assign.support': undefined };

const SUPPORT_LEAD: RoleGrants = {
  ...SUPPORT_AGENT,
  'ticket.reassign.any': 'all',
  'report.export': 'all',
};

const QA_LEAD: RoleGrants = {
  ...SUPPORT_AGENT,
  'ticket.reassign.any': 'all',
  'report.export': 'all',
};

const HOD: RoleGrants = {
  ...USER,
  'ticket.read.any': 'all',
  'ticket.list.queue': 'all',
  'comment.create.public': 'all',
  'comment.read.internal': 'all',
  'attachment.download': 'all',
  'board.view': 'all',
  'report.view': 'all',
  'report.export': 'all',
  'audit.read': 'all',
};

const ADMIN: RoleGrants = {
  ...SUPPORT_LEAD,
  ...HOD,
  'ticket.assign.support': 'all',
  'ticket.triage': 'all',
  'ticket.transition': 'all',
  'ticket.resolve': 'all',
  'config.portal.manage': 'all',
  'config.project.manage': 'all',
  'config.category.manage': 'all',
  'config.team.manage': 'all',
  'config.sla.manage': 'all',
  'config.routing.manage': 'all',
  'user.manage': 'all',
  'audit.read': 'all',
};

const SUPER_ADMIN: RoleGrants = {
  ...ADMIN,
  'role.manage': 'all',
  'ticket.delete': 'all',
};

export const ROLE_MATRIX: Record<RoleName, RoleGrants> = {
  USER,
  SUPPORT_AGENT,
  QA,
  DEVELOPER,
  SUPPORT_LEAD,
  QA_LEAD,
  HOD,
  ADMIN,
  SUPER_ADMIN,
};

/** Guests hold exactly these, and only against the single ticket their session is bound to. */
export const GUEST_PERMISSIONS: Permission[] = [
  'ticket.create',
  'comment.create.public',
  'attachment.upload',
  'attachment.download',
  'ticket.close',
  'ticket.reopen',
];

const SCOPE_RANK: Record<Scope, number> = { own: 0, assigned: 1, all: 2 };

/** The widest scope any of the actor's roles grants for a permission, or null if none do. */
export function scopeForRoles(roles: RoleName[], permission: Permission): Scope | null {
  let best: Scope | null = null;
  for (const role of roles) {
    const scope = ROLE_MATRIX[role]?.[permission];
    if (!scope) continue;
    if (!best || SCOPE_RANK[scope] > SCOPE_RANK[best]) best = scope;
  }
  return best;
}

/** Staff roles see the queue and staff navigation. */
export const STAFF_ROLES: RoleName[] = [
  'SUPPORT_AGENT',
  'QA',
  'DEVELOPER',
  'SUPPORT_LEAD',
  'QA_LEAD',
  'HOD',
  'ADMIN',
  'SUPER_ADMIN',
];
