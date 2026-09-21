/**
 * Standalone worker: `npm run worker`. Same image as the app, separate process, so mail and
 * other slow work never sits in a request path.
 */
import { runDueJobs } from './worker';
import { logger } from '@/lib/logger';

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
let running = true;

async function loop() {
  logger.info('worker.started', { intervalMs: INTERVAL_MS });
  while (running) {
    try {
      await runDueJobs();
    } catch (error) {
      logger.error('worker.iteration_failed', { error: String(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info('worker.stopping', { signal });
    running = false;
    setTimeout(() => process.exit(0), 1000);
  });
}

void loop();
