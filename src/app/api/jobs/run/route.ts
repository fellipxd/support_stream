import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/server/config/env';
import { runDueJobs } from '@/server/jobs/worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron-drivable job drain, for deployments without a long-running worker process.
 * Protected by a shared secret compared in constant time.
 */
export async function POST(request: NextRequest) {
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const expected = getEnv().JOB_RUNNER_SECRET;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runDueJobs(50);
  return NextResponse.json(result);
}
