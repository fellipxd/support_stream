import type { RoutingRule, Severity } from '@prisma/client';

/**
 * Deterministic, configurable routing (docs/SYSTEM_ARCHITECTURE.md). No AI in the decision
 * path: a rule either matches or it does not, and the most specific match wins. The boundary
 * is intentionally a pure function so an AI *suggester* can later propose inputs to it
 * (portal/category/severity) without ever owning the decision.
 */

export type RoutingInput = {
  portalId: string;
  categoryId?: string | null;
  severity: Severity;
};

export type RoutingOutcome = {
  projectId: string | null;
  supportTeamId: string | null;
  qaTeamId: string | null;
  engineeringTeamId: string | null;
  matchedRuleId: string | null;
};

const SEVERITY_RANK: Record<Severity, number> = {
  S1_CRITICAL: 4,
  S2_HIGH: 3,
  S3_MEDIUM: 2,
  S4_LOW: 1,
};

function matches(rule: RoutingRule, input: RoutingInput): boolean {
  if (!rule.isActive) return false;
  if (rule.portalId && rule.portalId !== input.portalId) return false;
  if (rule.categoryId && rule.categoryId !== input.categoryId) return false;
  if (rule.minSeverity && SEVERITY_RANK[input.severity] < SEVERITY_RANK[rule.minSeverity])
    return false;
  return true;
}

/** Higher is more specific: category (4) > portal (2) > severity floor (1). */
export function specificity(rule: RoutingRule): number {
  return (rule.categoryId ? 4 : 0) + (rule.portalId ? 2 : 0) + (rule.minSeverity ? 1 : 0);
}

export function route(rules: RoutingRule[], input: RoutingInput): RoutingOutcome {
  const candidates = rules
    .filter((r) => matches(r, input))
    .sort(
      (a, b) => specificity(b) - specificity(a) || a.createdAt.getTime() - b.createdAt.getTime(),
    );

  const empty: RoutingOutcome = {
    projectId: null,
    supportTeamId: null,
    qaTeamId: null,
    engineeringTeamId: null,
    matchedRuleId: null,
  };
  const best = candidates[0];
  if (!best) return empty;

  // Fields not set by the winning rule fall back to the next matching rule that does set them,
  // so a broad portal-level rule can supply defaults a narrow rule omits.
  const pick = <K extends keyof RoutingRule>(field: K): RoutingRule[K] | null => {
    for (const rule of candidates) {
      const value = rule[field];
      if (value) return value;
    }
    return null;
  };

  return {
    projectId: (pick('projectId') as string | null) ?? null,
    supportTeamId: (pick('supportTeamId') as string | null) ?? null,
    qaTeamId: (pick('qaTeamId') as string | null) ?? null,
    engineeringTeamId: (pick('engineeringTeamId') as string | null) ?? null,
    matchedRuleId: best.id,
  };
}
