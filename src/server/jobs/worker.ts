import 'server-only';
import { randomUUID } from 'node:crypto';
import { logger } from '@/lib/logger';
import { claim, complete, fail, reclaimStale } from './queue';
import { HANDLERS, payloadOf } from './handlers';

/** Drains due jobs once. Used by the worker loop and by the cron-protected API route. */
export async function runDueJobs(limit = 20): Promise<{ processed: number; failed: number }> {
  const workerId = `worker-${randomUUID().slice(0, 8)}`;
  await reclaimStale();

  const jobs = await claim(workerId, limit);
  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const handler = HANDLERS[job.type];
    if (!handler) {
      await fail(job, new Error(`No handler registered for job type ${job.type}`));
      failed++;
      continue;
    }
    try {
      await handler(payloadOf(job.payload));
      await complete(job.id);
      processed++;
    } catch (error) {
      await fail(job, error);
      failed++;
    }
  }
  if (jobs.length) logger.info('jobs.drained', { processed, failed, workerId });
  return { processed, failed };
}
