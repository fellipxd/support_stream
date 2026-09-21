import { describe, expect, it } from 'vitest';
import {
  addBusinessMinutes,
  computeDeadlines,
  evaluateState,
  remainingMs,
  type SlaSnapshot,
} from '@/server/sla/engine';

/** docs/PRODUCT_REQUIREMENTS.md A8 — business-hours arithmetic and breach detection. */

const HOURS = { days: [1, 2, 3, 4, 5], startHour: 8, endHour: 17 };

describe('business-hours arithmetic', () => {
  it('adds minutes inside a single working day', () => {
    const result = addBusinessMinutes(new Date('2026-09-21T09:00:00Z'), 120, HOURS); // Monday
    expect(result.toISOString()).toBe('2026-09-21T11:00:00.000Z');
  });

  it('rolls over to the next working day when the day runs out', () => {
    const result = addBusinessMinutes(new Date('2026-09-21T16:00:00Z'), 120, HOURS);
    expect(result.toISOString()).toBe('2026-09-22T09:00:00.000Z');
  });

  it('skips the weekend', () => {
    const result = addBusinessMinutes(new Date('2026-09-25T16:00:00Z'), 120, HOURS); // Friday
    expect(result.getUTCDay()).toBe(1); // Monday
    expect(result.toISOString()).toBe('2026-09-28T09:00:00.000Z');
  });

  it('starts the clock at opening time when work arrives overnight', () => {
    const result = addBusinessMinutes(new Date('2026-09-21T03:00:00Z'), 60, HOURS);
    expect(result.toISOString()).toBe('2026-09-21T09:00:00.000Z');
  });

  it('returns the same instant for zero minutes', () => {
    const start = new Date('2026-09-21T10:00:00Z');
    expect(addBusinessMinutes(start, 0, HOURS).getTime()).toBe(start.getTime());
  });
});

describe('deadline calculation', () => {
  it('uses the wall clock for 24/7 policies', () => {
    const { firstResponseDueAt, resolutionDueAt } = computeDeadlines(
      { firstResponseMins: 15, resolutionMins: 240, businessHoursOnly: false },
      new Date('2026-09-26T22:00:00Z'), // Saturday night
      HOURS,
    );
    expect(firstResponseDueAt.toISOString()).toBe('2026-09-26T22:15:00.000Z');
    expect(resolutionDueAt.toISOString()).toBe('2026-09-27T02:00:00.000Z');
  });

  it('uses business hours when the policy says so', () => {
    const { resolutionDueAt } = computeDeadlines(
      { firstResponseMins: 60, resolutionMins: 480, businessHoursOnly: true },
      new Date('2026-09-25T16:00:00Z'), // Friday 16:00
      HOURS,
    );
    // 8 business hours from Friday 16:00 lands on Monday afternoon, not Saturday.
    expect(resolutionDueAt.getUTCDay()).toBe(1);
  });
});

const snapshot = (overrides: Partial<SlaSnapshot> = {}): SlaSnapshot => ({
  createdAt: new Date('2026-09-21T09:00:00Z'),
  firstResponseDueAt: new Date('2026-09-21T10:00:00Z'),
  resolutionDueAt: new Date('2026-09-21T17:00:00Z'),
  firstResponseMetAt: null,
  resolutionMetAt: null,
  pausedAt: null,
  pausedMs: 0,
  warningThresholdPct: 80,
  ...overrides,
});

describe('SLA state', () => {
  it('is OK early in the window', () => {
    expect(evaluateState(snapshot(), new Date('2026-09-21T09:30:00Z'))).toBe('OK');
  });

  it('warns once the threshold is crossed', () => {
    // 80% of an 8-hour window is 15:24.
    expect(
      evaluateState(
        snapshot({ firstResponseMetAt: new Date('2026-09-21T09:30:00Z') }),
        new Date('2026-09-21T15:30:00Z'),
      ),
    ).toBe('WARNING');
  });

  it('breaches when first response is missed', () => {
    expect(evaluateState(snapshot(), new Date('2026-09-21T10:30:00Z'))).toBe('BREACHED');
  });

  it('breaches when resolution is missed', () => {
    expect(
      evaluateState(
        snapshot({ firstResponseMetAt: new Date('2026-09-21T09:30:00Z') }),
        new Date('2026-09-21T18:00:00Z'),
      ),
    ).toBe('BREACHED');
  });

  it('reports MET when resolved inside the target', () => {
    expect(
      evaluateState(
        snapshot({
          firstResponseMetAt: new Date('2026-09-21T09:30:00Z'),
          resolutionMetAt: new Date('2026-09-21T14:00:00Z'),
        }),
        new Date('2026-09-22T09:00:00Z'),
      ),
    ).toBe('MET');
  });

  it('does not burn the clock while paused waiting on the reporter', () => {
    const paused = snapshot({
      firstResponseMetAt: new Date('2026-09-21T09:30:00Z'),
      pausedAt: new Date('2026-09-21T10:00:00Z'),
    });
    // Twelve hours later in wall time, but every one of them paused.
    expect(evaluateState(paused, new Date('2026-09-21T22:00:00Z'))).toBe('OK');
  });

  it('counts accumulated pause time after the ticket resumes', () => {
    const resumed = snapshot({
      firstResponseMetAt: new Date('2026-09-21T09:30:00Z'),
      pausedMs: 6 * 3_600_000,
    });
    expect(evaluateState(resumed, new Date('2026-09-21T20:00:00Z'))).toBe('OK');
    expect(remainingMs(resumed, new Date('2026-09-21T20:00:00Z'))).toBeGreaterThan(0);
  });
});
