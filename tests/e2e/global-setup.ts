import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/support_stream_e2e?schema=public';

/**
 * A clean, seeded database for every E2E run — the suite asserts on known fixtures.
 * Truncating rather than dropping keeps the schema (and any concurrent connection) intact,
 * and avoids a destructive `migrate reset` against whatever the URL happens to point at.
 */
export default async function globalSetup() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL },
    stdio: 'inherit',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;
    const list = tables.map((t) => `"${t.tablename}"`).join(', ');
    if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx tsx prisma/seed.ts', { env: { ...process.env, DATABASE_URL }, stdio: 'inherit' });
}
