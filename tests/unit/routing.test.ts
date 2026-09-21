import { describe, expect, it } from 'vitest';
import type { RoutingRule } from '@prisma/client';
import { route, specificity } from '@/server/routing/engine';

/** docs/SYSTEM_ARCHITECTURE.md — deterministic routing, most specific rule wins. */

const rule = (overrides: Partial<RoutingRule>): RoutingRule => ({
  id: 'r',
  name: 'rule',
  portalId: null,
  categoryId: null,
  minSeverity: null,
  projectId: null,
  supportTeamId: null,
  qaTeamId: null,
  engineeringTeamId: null,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

describe('routing engine', () => {
  it('returns nothing when no rule matches', () => {
    const outcome = route([rule({ id: 'a', portalId: 'other-portal' })], {
      portalId: 'p1',
      severity: 'S3_MEDIUM',
    });
    expect(outcome.matchedRuleId).toBeNull();
    expect(outcome.projectId).toBeNull();
  });

  it('matches a portal-level default', () => {
    const rules = [
      rule({ id: 'portal-default', portalId: 'p1', projectId: 'proj-1', supportTeamId: 'sup-1' }),
    ];
    const outcome = route(rules, { portalId: 'p1', severity: 'S3_MEDIUM' });
    expect(outcome).toMatchObject({
      matchedRuleId: 'portal-default',
      projectId: 'proj-1',
      supportTeamId: 'sup-1',
    });
  });

  it('prefers a portal+category rule over a portal-only rule', () => {
    const rules = [
      rule({ id: 'broad', portalId: 'p1', projectId: 'general-project', qaTeamId: 'general-qa' }),
      rule({
        id: 'narrow',
        portalId: 'p1',
        categoryId: 'settlement',
        projectId: 'payments-project',
        qaTeamId: 'payments-qa',
      }),
    ];
    const outcome = route(rules, {
      portalId: 'p1',
      categoryId: 'settlement',
      severity: 'S3_MEDIUM',
    });
    expect(outcome).toMatchObject({
      matchedRuleId: 'narrow',
      projectId: 'payments-project',
      qaTeamId: 'payments-qa',
    });
  });

  it('falls back to a broader rule for fields the narrow rule omits', () => {
    const rules = [
      rule({
        id: 'broad',
        portalId: 'p1',
        supportTeamId: 'portal-support',
        engineeringTeamId: 'portal-eng',
      }),
      rule({ id: 'narrow', portalId: 'p1', categoryId: 'c1', projectId: 'special-project' }),
    ];
    const outcome = route(rules, { portalId: 'p1', categoryId: 'c1', severity: 'S3_MEDIUM' });
    expect(outcome.projectId).toBe('special-project');
    expect(outcome.supportTeamId).toBe('portal-support');
    expect(outcome.engineeringTeamId).toBe('portal-eng');
  });

  it('honours a minimum severity floor', () => {
    const rules = [
      rule({
        id: 'escalation',
        portalId: 'p1',
        minSeverity: 'S2_HIGH',
        supportTeamId: 'escalation-team',
      }),
    ];
    expect(route(rules, { portalId: 'p1', severity: 'S3_MEDIUM' }).matchedRuleId).toBeNull();
    expect(route(rules, { portalId: 'p1', severity: 'S1_CRITICAL' }).matchedRuleId).toBe(
      'escalation',
    );
  });

  it('ignores inactive rules', () => {
    const rules = [rule({ id: 'disabled', portalId: 'p1', projectId: 'x', isActive: false })];
    expect(route(rules, { portalId: 'p1', severity: 'S3_MEDIUM' }).matchedRuleId).toBeNull();
  });

  it('breaks ties by creation order, so routing is stable', () => {
    const rules = [
      rule({ id: 'newer', portalId: 'p1', projectId: 'b', createdAt: new Date('2026-06-01') }),
      rule({ id: 'older', portalId: 'p1', projectId: 'a', createdAt: new Date('2026-01-01') }),
    ];
    expect(route(rules, { portalId: 'p1', severity: 'S3_MEDIUM' }).matchedRuleId).toBe('older');
  });

  it('ranks specificity: category beats portal beats severity floor', () => {
    expect(specificity(rule({ categoryId: 'c' }))).toBeGreaterThan(
      specificity(rule({ portalId: 'p' })),
    );
    expect(specificity(rule({ portalId: 'p' }))).toBeGreaterThan(
      specificity(rule({ minSeverity: 'S1_CRITICAL' })),
    );
  });

  it('routes the brief worked example: Payment Portal + Settlement', () => {
    const rules = [
      rule({
        id: 'payment-default',
        portalId: 'payment',
        projectId: 'payment-project',
        supportTeamId: 'payment-support',
      }),
      rule({
        id: 'settlement',
        portalId: 'payment',
        categoryId: 'settlement',
        projectId: 'payments-board',
        supportTeamId: 'payments-queue',
        qaTeamId: 'payments-qa',
      }),
    ];
    expect(
      route(rules, { portalId: 'payment', categoryId: 'settlement', severity: 'S2_HIGH' }),
    ).toMatchObject({
      projectId: 'payments-board',
      supportTeamId: 'payments-queue',
      qaTeamId: 'payments-qa',
    });
  });
});
