import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { queueDepth } from '@/server/jobs/queue';

export const dynamic = 'force-dynamic';

/** Liveness and readiness. Exposes no data beyond aggregate counters. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const jobs = await queueDepth();
    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      jobs,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unreachable' }, { status: 503 });
  }
}
