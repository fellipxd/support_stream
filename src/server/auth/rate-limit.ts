import { prisma } from '../db/client';
import { RateLimitError } from '@/lib/errors';

/**
 * Database-backed fixed-window limiter (docs/SECURITY_MODEL.md T2, T10, T12). Shared across
 * app instances, unlike an in-memory counter, and needs no extra infrastructure.
 */
export type LimitSpec = { key: string; limit: number; windowSeconds: number };

export async function consume(spec: LimitSpec): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + spec.windowSeconds * 1000);

  const rows = await prisma.$queryRaw<Array<{ count: number; windowEnd: Date }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowEnd", "updatedAt")
    VALUES (${spec.key}, 1, ${windowEnd}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowEnd" < ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowEnd" = CASE WHEN "RateLimitBucket"."windowEnd" < ${now} THEN ${windowEnd} ELSE "RateLimitBucket"."windowEnd" END,
      "updatedAt" = ${now}
    RETURNING "count", "windowEnd"
  `;
  const row = rows[0];
  if (!row) return { allowed: true, retryAfter: 0 };
  const allowed = row.count <= spec.limit;
  const retryAfter = Math.max(1, Math.ceil((row.windowEnd.getTime() - now.getTime()) / 1000));
  return { allowed, retryAfter };
}

export async function enforce(spec: LimitSpec): Promise<void> {
  const result = await consume(spec);
  if (!result.allowed) throw new RateLimitError(result.retryAfter);
}

/** Best-effort cleanup, called by the maintenance job. */
export async function pruneExpired(): Promise<number> {
  const { count } = await prisma.rateLimitBucket.deleteMany({
    where: { windowEnd: { lt: new Date(Date.now() - 3_600_000) } },
  });
  return count;
}
