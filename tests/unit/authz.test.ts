import { describe, expect, it } from 'vitest';
import type { RoleName } from '@prisma/client';
import {
  can,
  hasPermission,
  isStaff,
  ticketScopeWhere,
  visibleCommentVisibilities,
} from '@/server/authz/policy';
import { scopeForRoles, type Permission } from '@/server/authz/permissions';
import type { Actor } from '@/server/authz/actor';

/** docs/RBAC.md — the matrix asserted cell by cell. */

const user = (roles: RoleName[], id = 'u1'): Actor => ({
  kind: 'user',
  id,
  name: 'Person',
  email: 'p@example.com',
  roles,
  organizationId: 'org',
});

const guest: Actor = {
  kind: 'guest',
  ticketId: 't1',
  guestReporterId: 'g1',
  name: 'Guest',
  email: 'g@e.com',
};

const ticket = (overrides: Record<string, string | null> = {}) => ({
  id: 't1',
  reporterUserId: null,
  guestReporterId: 'g1',
  supportOwnerId: null,
  qaOwnerId: null,
  developerId: null,
  ...overrides,
});

describe('permission matrix', () => {
  const cases: Array<[RoleName, Permission, boolean]> = [
    ['USER', 'ticket.create', true],
    ['USER', 'ticket.read.any', false],
    ['USER', 'ticket.triage', false],
    ['USER', 'comment.create.internal', false],
    ['USER', 'comment.read.internal', false],
    ['USER', 'report.view', false],
    ['SUPPORT_AGENT', 'ticket.triage', true],
    ['SUPPORT_AGENT', 'ticket.assign.support', true],
    ['SUPPORT_AGENT', 'ticket.assign.developer', true],
    ['SUPPORT_AGENT', 'comment.create.internal', true],
    ['SUPPORT_AGENT', 'config.portal.manage', false],
    ['SUPPORT_AGENT', 'ticket.reassign.any', false],
    ['SUPPORT_AGENT', 'report.export', false],
    ['QA', 'ticket.assign.support', false],
    ['QA', 'ticket.assign.qa', true],
    ['QA', 'ticket.resolve', true],
    ['DEVELOPER', 'ticket.transition', true],
    ['DEVELOPER', 'ticket.triage', false],
    ['DEVELOPER', 'ticket.resolve', false],
    ['DEVELOPER', 'config.portal.manage', false],
    ['SUPPORT_LEAD', 'ticket.reassign.any', true],
    ['SUPPORT_LEAD', 'report.export', true],
    ['SUPPORT_LEAD', 'user.manage', false],
    ['QA_LEAD', 'ticket.reassign.any', true],
    ['HOD', 'report.export', true],
    ['HOD', 'audit.read', true],
    ['HOD', 'ticket.triage', false],
    ['HOD', 'config.portal.manage', false],
    ['ADMIN', 'config.portal.manage', true],
    ['ADMIN', 'config.sla.manage', true],
    ['ADMIN', 'user.manage', true],
    ['ADMIN', 'audit.read', true],
    ['ADMIN', 'role.manage', false],
    ['ADMIN', 'ticket.delete', false],
    ['SUPER_ADMIN', 'role.manage', true],
    ['SUPER_ADMIN', 'ticket.delete', true],
  ];

  it.each(cases)('%s %s → %s', (role, permission, expected) => {
    expect(hasPermission(user([role]), permission)).toBe(expected);
  });

  it('takes the union of several roles', () => {
    expect(hasPermission(user(['USER', 'DEVELOPER', 'QA']), 'ticket.resolve')).toBe(true);
  });

  it('takes the widest scope across roles', () => {
    expect(scopeForRoles(['DEVELOPER', 'SUPPORT_AGENT'], 'ticket.read.any')).toBe('all');
    expect(scopeForRoles(['DEVELOPER'], 'ticket.read.any')).toBe('assigned');
  });

  it('identifies staff roles', () => {
    expect(isStaff(user(['USER']))).toBe(false);
    expect(isStaff(user(['USER', 'SUPPORT_AGENT']))).toBe(true);
    expect(isStaff(guest)).toBe(false);
  });
});

describe('resource scoping', () => {
  it('lets a reporter read their own ticket but not another', () => {
    const reporter = user(['USER'], 'r1');
    expect(
      can(
        reporter,
        'comment.create.public',
        ticket({ reporterUserId: 'r1', guestReporterId: null }),
      ),
    ).toBe(true);
    expect(
      can(
        reporter,
        'comment.create.public',
        ticket({ reporterUserId: 'other', guestReporterId: null }),
      ),
    ).toBe(false);
  });

  it('limits a developer to tickets assigned to them', () => {
    const developer = user(['DEVELOPER'], 'd1');
    expect(can(developer, 'ticket.read.any', ticket({ developerId: 'd1' }))).toBe(true);
    expect(can(developer, 'ticket.read.any', ticket({ developerId: 'someone-else' }))).toBe(false);
  });

  it('binds a guest to exactly one ticket', () => {
    expect(can(guest, 'comment.create.public', ticket({ id: 't1' }))).toBe(true);
    expect(can(guest, 'comment.create.public', ticket({ id: 't2' }))).toBe(false);
  });

  it('never grants a guest internal comment access', () => {
    expect(can(guest, 'comment.create.internal', ticket())).toBe(false);
    expect(can(guest, 'comment.read.internal', ticket())).toBe(false);
    expect(visibleCommentVisibilities(guest, ticket())).toEqual(['PUBLIC', 'SYSTEM']);
  });

  it('gives staff the internal visibilities', () => {
    expect(visibleCommentVisibilities(user(['SUPPORT_AGENT']), ticket())).toContain('INTERNAL');
    expect(visibleCommentVisibilities(user(['USER']), ticket())).not.toContain('INTERNAL');
  });
});

describe('list scoping (SQL predicate)', () => {
  it('scopes a guest to their single ticket', () => {
    expect(ticketScopeWhere(guest)).toEqual({ id: 't1' });
  });

  it('scopes a plain user to what they reported', () => {
    expect(ticketScopeWhere(user(['USER'], 'u9'))).toEqual({
      archivedAt: null,
      reporterUserId: 'u9',
    });
  });

  it('scopes a developer to assigned or reported tickets', () => {
    const where = ticketScopeWhere(user(['DEVELOPER'], 'd1'));
    expect(where.OR).toEqual([
      { supportOwnerId: 'd1' },
      { qaOwnerId: 'd1' },
      { developerId: 'd1' },
      { reporterUserId: 'd1' },
    ]);
  });

  it('gives support agents the whole organisation, minus archived tickets', () => {
    expect(ticketScopeWhere(user(['SUPPORT_AGENT']))).toEqual({ archivedAt: null });
  });
});
