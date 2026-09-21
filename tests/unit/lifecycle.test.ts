import { describe, expect, it } from 'vitest';
import type { Ticket } from '@prisma/client';
import {
  TRANSITIONS,
  availableTransitions,
  checkTransition,
  isTerminal,
} from '@/server/tickets/lifecycle';
import type { Actor } from '@/server/authz/actor';

/** docs/TICKET_LIFECYCLE.md — the transition table is the specification; this asserts it. */

const BASE: Ticket = {
  id: 'ticket-1',
  key: 'SUP-000001',
  organizationId: 'org',
  portalId: 'portal',
  projectId: 'project',
  categoryId: 'category',
  status: 'NEW',
  severity: 'S3_MEDIUM',
  priority: 'P2_NORMAL',
  title: 'Title',
  description: 'Description',
  whatTrying: null,
  whatHappened: null,
  whatExpected: null,
  frequency: null,
  occurredAt: null,
  browser: null,
  os: null,
  device: null,
  pageUrl: null,
  reporterUserId: 'reporter',
  guestReporterId: null,
  supportOwnerId: null,
  qaOwnerId: null,
  developerId: null,
  supportTeamId: null,
  qaTeamId: null,
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  reopenCount: 0,
  rejectionReason: null,
  resolutionNote: null,
  archivedAt: null,
  searchText: '',
  createdAt: new Date('2026-01-01T09:00:00Z'),
  updatedAt: new Date('2026-01-01T09:00:00Z'),
};

const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({ ...BASE, ...overrides });

const support: Actor = {
  kind: 'user',
  id: 'support',
  name: 'Support',
  email: 's@e.com',
  roles: ['SUPPORT_AGENT'],
  organizationId: 'org',
};
const qa: Actor = {
  kind: 'user',
  id: 'qa',
  name: 'QA',
  email: 'q@e.com',
  roles: ['QA'],
  organizationId: 'org',
};
const dev: Actor = {
  kind: 'user',
  id: 'dev',
  name: 'Dev',
  email: 'd@e.com',
  roles: ['DEVELOPER'],
  organizationId: 'org',
};
const admin: Actor = {
  kind: 'user',
  id: 'admin',
  name: 'Admin',
  email: 'a@e.com',
  roles: ['ADMIN'],
  organizationId: 'org',
};
const reporter: Actor = {
  kind: 'user',
  id: 'reporter',
  name: 'Reporter',
  email: 'r@e.com',
  roles: ['USER'],
  organizationId: 'org',
};

const ctx = { reopenWindowDays: 14, now: new Date('2026-01-02T09:00:00Z') };

describe('ticket lifecycle', () => {
  describe('the happy path', () => {
    const path: Array<[Ticket, Parameters<typeof checkTransition>[2], Actor]> = [
      [ticket({ status: 'NEW' }), 'TRIAGE', support],
      [ticket({ status: 'TRIAGE', supportOwnerId: 'support' }), 'ASSIGNED', support],
      [ticket({ status: 'ASSIGNED' }), 'IN_PROGRESS', support],
      [ticket({ status: 'IN_PROGRESS', developerId: 'dev' }), 'WAITING_FOR_DEVELOPER', qa],
      [ticket({ status: 'WAITING_FOR_DEVELOPER', developerId: 'dev' }), 'READY_FOR_QA', dev],
      [ticket({ status: 'READY_FOR_QA' }), 'QA_VERIFICATION', qa],
      [ticket({ status: 'QA_VERIFICATION' }), 'RESOLVED', qa],
      [
        ticket({ status: 'RESOLVED', resolvedAt: new Date('2026-01-02T08:00:00Z') }),
        'CLOSED',
        reporter,
      ],
    ];

    it.each(path)('allows %# $status → %s', (t, to, actor) => {
      expect(checkTransition(actor, t, to, ctx)).toEqual({ allowed: true });
    });
  });

  describe('illegal transitions', () => {
    it('refuses a jump straight from NEW to RESOLVED', () => {
      const result = checkTransition(admin, ticket({ status: 'NEW' }), 'RESOLVED', ctx);
      expect(result).toMatchObject({ allowed: false });
    });

    it('refuses to move a closed ticket back into progress', () => {
      const result = checkTransition(admin, ticket({ status: 'CLOSED' }), 'IN_PROGRESS', ctx);
      expect(result).toMatchObject({ allowed: false });
    });

    it.each(['DUPLICATE', 'REJECTED', 'CANCELLED'] as const)('treats %s as terminal', (status) => {
      expect(isTerminal(status)).toBe(true);
      expect(TRANSITIONS[status]).toHaveLength(0);
    });

    it('refuses an unknown target from a terminal state', () => {
      expect(checkTransition(admin, ticket({ status: 'REJECTED' }), 'TRIAGE', ctx).allowed).toBe(
        false,
      );
    });
  });

  describe('guards', () => {
    it('requires a support owner before a ticket can be assigned', () => {
      const result = checkTransition(
        support,
        ticket({ status: 'TRIAGE', supportOwnerId: null }),
        'ASSIGNED',
        ctx,
      );
      expect(result).toMatchObject({
        allowed: false,
        reason: expect.stringContaining('support owner'),
      });
    });

    it('accepts an incoming support owner supplied by the same transition', () => {
      const result = checkTransition(
        support,
        ticket({ status: 'TRIAGE', supportOwnerId: null }),
        'ASSIGNED',
        {
          ...ctx,
          incoming: { supportOwnerId: 'support' },
        },
      );
      expect(result.allowed).toBe(true);
    });

    it('requires a developer before ready-for-QA', () => {
      const result = checkTransition(
        qa,
        ticket({ status: 'IN_PROGRESS', developerId: null }),
        'READY_FOR_QA',
        ctx,
      );
      expect(result).toMatchObject({
        allowed: false,
        reason: expect.stringContaining('developer'),
      });
    });

    it('requires a primary ticket before marking a duplicate', () => {
      const result = checkTransition(support, ticket({ status: 'TRIAGE' }), 'DUPLICATE', ctx);
      expect(result).toMatchObject({ allowed: false });
      expect(
        checkTransition(support, ticket({ status: 'TRIAGE' }), 'DUPLICATE', {
          ...ctx,
          hasDuplicateOf: true,
        }).allowed,
      ).toBe(true);
    });

    it('requires a reason before rejecting', () => {
      const leadActor: Actor = { ...admin };
      expect(checkTransition(leadActor, ticket({ status: 'NEW' }), 'REJECTED', ctx).allowed).toBe(
        false,
      );
      expect(
        checkTransition(leadActor, ticket({ status: 'NEW' }), 'REJECTED', {
          ...ctx,
          incoming: { rejectionReason: 'Not a bug' },
        }).allowed,
      ).toBe(true);
    });

    it('closes the reopen window once it has passed', () => {
      const closedLongAgo = ticket({
        status: 'CLOSED',
        closedAt: new Date('2025-11-01T09:00:00Z'),
      });
      expect(checkTransition(reporter, closedLongAgo, 'REOPENED', ctx)).toMatchObject({
        allowed: false,
        reason: expect.stringContaining('reopen window'),
      });
    });

    it('permits a reopen inside the window', () => {
      const closedYesterday = ticket({
        status: 'CLOSED',
        closedAt: new Date('2026-01-01T09:00:00Z'),
      });
      expect(checkTransition(reporter, closedYesterday, 'REOPENED', ctx).allowed).toBe(true);
    });
  });

  describe('actor restrictions', () => {
    it('does not let a developer resolve a ticket', () => {
      const t = ticket({ status: 'IN_PROGRESS', developerId: 'dev' });
      expect(checkTransition(dev, t, 'RESOLVED', ctx).allowed).toBe(false);
    });

    it('does not let a developer act on a ticket assigned to someone else', () => {
      const t = ticket({ status: 'IN_PROGRESS', developerId: 'someone-else' });
      expect(checkTransition(dev, t, 'READY_FOR_QA', ctx).allowed).toBe(false);
    });

    it('does not let a plain reporter start work', () => {
      expect(checkTransition(reporter, ticket({ status: 'NEW' }), 'TRIAGE', ctx).allowed).toBe(
        false,
      );
    });

    it('lets a reporter cancel their own unstarted ticket', () => {
      expect(checkTransition(reporter, ticket({ status: 'NEW' }), 'CANCELLED', ctx).allowed).toBe(
        true,
      );
    });

    it('scopes a guest to the ticket their session is bound to', () => {
      const t = ticket({
        status: 'RESOLVED',
        resolvedAt: new Date('2026-01-02T08:00:00Z'),
        reporterUserId: null,
        guestReporterId: 'g1',
      });
      const bound: Actor = {
        kind: 'guest',
        ticketId: t.id,
        guestReporterId: 'g1',
        name: 'G',
        email: 'g@e.com',
      };
      const other: Actor = {
        kind: 'guest',
        ticketId: 'another-ticket',
        guestReporterId: 'g2',
        name: 'G2',
        email: 'g2@e.com',
      };
      expect(checkTransition(bound, t, 'CLOSED', ctx).allowed).toBe(true);
      expect(checkTransition(other, t, 'CLOSED', ctx).allowed).toBe(false);
    });
  });

  it('treats a transition to the current status as a no-op, not an error', () => {
    expect(checkTransition(support, ticket({ status: 'IN_PROGRESS' }), 'IN_PROGRESS', ctx)).toEqual(
      { allowed: true },
    );
  });

  it('only offers transitions the actor can actually make', () => {
    const t = ticket({ status: 'IN_PROGRESS', developerId: 'dev' });
    const forDeveloper = availableTransitions(dev, t, ctx);
    expect(forDeveloper).toContain('READY_FOR_QA');
    expect(forDeveloper).not.toContain('RESOLVED');

    const forQa = availableTransitions(qa, t, ctx);
    expect(forQa).toContain('RESOLVED');
  });
});
