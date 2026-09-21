import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../db/client';
import { logger } from '@/lib/logger';

/**
 * Postgres-backed queue (docs/SYSTEM_ARCHITECTURE.md §2). Enqueue participates in the
 * caller's transaction, so a job is never scheduled for work that rolled back, and never lost
 * for work that committed.
 */
export type JobType =
  'email.send' | 'ticket.auto_close' | 'sla.sweep' | 'attachment.scan' | 'maintenance.prune';

export type JobPayload = Record<string, unknown>;

/** Retry schedule in minutes: 1m, 5m, 15m, 1h, 6h. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 360];

export async function enqueue(
  tx: Tx,
  type: JobType,
  payload: JobPayload,
  options?: { runAt?: Date; maxAttempts?: number },
): Promise<string> {
  const job = await tx.job.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      runAt: options?.runAt ?? new Date(),
      maxAttempts: options?.maxAttempts ?? BACKOFF_MINUTES.length,
    },
    select: { id: true },
  });
  return job.id;
}

export type ClaimedJob = {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
};

/** Claims up to `limit` due jobs using SKIP LOCKED so workers never contend. */
export async function claim(workerId: string, limit = 10): Promise<ClaimedJob[]> {
  return prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = NOW(), "lockedBy" = ${workerId},
      "attempts" = "attempts" + 1, "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id" FROM "Job"
      WHERE "status" = 'PENDING' AND "runAt" <= NOW()
      ORDER BY "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"
  `;
}

export async function complete(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'DONE', lockedAt: null, lockedBy: null, lastError: null },
  });
}

export async function fail(job: ClaimedJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  const delayMinutes =
    BACKOFF_MINUTES[Math.min(job.attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 60;

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: exhausted ? 'DEAD' : 'PENDING',
      runAt: new Date(Date.now() + delayMinutes * 60_000),
      lockedAt: null,
      lockedBy: null,
      lastError: message.slice(0, 2000),
    },
  });
  logger.warn('job.failed', {
    jobId: job.id,
    type: job.type,
    attempts: job.attempts,
    exhausted,
    error: message,
  });
}

/** Releases jobs whose worker died mid-run. */
export async function reclaimStale(olderThanMinutes = 15): Promise<number> {
  const { count } = await prisma.job.updateMany({
    where: {
      status: 'RUNNING',
      lockedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) },
    },
    data: { status: 'PENDING', lockedAt: null, lockedBy: null },
  });
  return count;
}

export async function queueDepth(): Promise<{ pending: number; dead: number; running: number }> {
  const [pending, dead, running] = await Promise.all([
    prisma.job.count({ where: { status: 'PENDING' } }),
    prisma.job.count({ where: { status: 'DEAD' } }),
    prisma.job.count({ where: { status: 'RUNNING' } }),
  ]);
  return { pending, dead, running };
}
