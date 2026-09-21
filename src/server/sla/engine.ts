import type { SlaPolicy, SlaState } from '@prisma/client';

/**
 * SLA arithmetic (docs/PRODUCT_REQUIREMENTS.md A8). Pure functions: no database, no clock of
 * their own — every entry point takes `now`, which is what makes them testable.
 */

export type BusinessHours = {
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  startHour: number;
  endHour: number;
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  days: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 17,
};

function isWorkingDay(date: Date, hours: BusinessHours): boolean {
  return hours.days.includes(date.getUTCDay());
}

/** Adds `minutes` of *business* time to `from`, skipping nights and non-working days. */
export function addBusinessMinutes(
  from: Date,
  minutes: number,
  hours = DEFAULT_BUSINESS_HOURS,
): Date {
  if (minutes <= 0) return new Date(from.getTime());
  const dayMinutes = (hours.endHour - hours.startHour) * 60;
  if (dayMinutes <= 0 || hours.days.length === 0)
    return new Date(from.getTime() + minutes * 60_000);

  const cursor = new Date(from.getTime());
  let remaining = minutes;
  let guard = 0;

  while (remaining > 0 && guard++ < 5000) {
    if (!isWorkingDay(cursor, hours)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(hours.startHour, 0, 0, 0);
      continue;
    }
    const dayStart = new Date(cursor);
    dayStart.setUTCHours(hours.startHour, 0, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(hours.endHour, 0, 0, 0);

    if (cursor < dayStart) {
      cursor.setTime(dayStart.getTime());
      continue;
    }
    if (cursor >= dayEnd) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(hours.startHour, 0, 0, 0);
      continue;
    }
    const availableMins = (dayEnd.getTime() - cursor.getTime()) / 60_000;
    if (remaining <= availableMins) {
      cursor.setTime(cursor.getTime() + remaining * 60_000);
      remaining = 0;
    } else {
      remaining -= availableMins;
      cursor.setTime(dayEnd.getTime());
    }
  }
  return cursor;
}

export type Deadlines = { firstResponseDueAt: Date; resolutionDueAt: Date };

export function computeDeadlines(
  policy: Pick<SlaPolicy, 'firstResponseMins' | 'resolutionMins' | 'businessHoursOnly'>,
  startedAt: Date,
  hours = DEFAULT_BUSINESS_HOURS,
): Deadlines {
  const add = (mins: number) =>
    policy.businessHoursOnly
      ? addBusinessMinutes(startedAt, mins, hours)
      : new Date(startedAt.getTime() + mins * 60_000);
  return {
    firstResponseDueAt: add(policy.firstResponseMins),
    resolutionDueAt: add(policy.resolutionMins),
  };
}

export type SlaSnapshot = {
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
  firstResponseMetAt: Date | null;
  resolutionMetAt: Date | null;
  pausedAt: Date | null;
  pausedMs: number;
  warningThresholdPct: number;
  createdAt: Date;
};

/**
 * Current SLA state. Paused time is excluded: a ticket waiting on the reporter does not burn
 * the organisation's clock.
 */
export function evaluateState(snapshot: SlaSnapshot, now: Date): SlaState {
  const pausedMs =
    snapshot.pausedMs + (snapshot.pausedAt ? now.getTime() - snapshot.pausedAt.getTime() : 0);
  const effectiveNow = new Date(now.getTime() - pausedMs);

  const frBreached = !snapshot.firstResponseMetAt && effectiveNow > snapshot.firstResponseDueAt;
  const resBreached = !snapshot.resolutionMetAt && effectiveNow > snapshot.resolutionDueAt;
  if (frBreached || resBreached) return 'BREACHED';

  if (snapshot.resolutionMetAt) {
    const missed =
      snapshot.resolutionMetAt.getTime() - pausedMs > snapshot.resolutionDueAt.getTime() ||
      (snapshot.firstResponseMetAt
        ? snapshot.firstResponseMetAt.getTime() - pausedMs > snapshot.firstResponseDueAt.getTime()
        : false);
    return missed ? 'BREACHED' : 'MET';
  }

  const total = snapshot.resolutionDueAt.getTime() - snapshot.createdAt.getTime();
  const elapsed = effectiveNow.getTime() - snapshot.createdAt.getTime();
  if (total > 0 && (elapsed / total) * 100 >= snapshot.warningThresholdPct) return 'WARNING';
  return 'OK';
}

export function remainingMs(snapshot: SlaSnapshot, now: Date): number {
  const pausedMs =
    snapshot.pausedMs + (snapshot.pausedAt ? now.getTime() - snapshot.pausedAt.getTime() : 0);
  return snapshot.resolutionDueAt.getTime() - (now.getTime() - pausedMs);
}

/** Statuses during which the SLA clock is paused. */
export const PAUSED_STATUSES = ['WAITING_FOR_USER'] as const;
