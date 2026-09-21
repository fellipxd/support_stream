import { prisma } from '@/server/db/client';
import { getEnv } from '@/server/config/env';
import { getSessionUser } from '@/server/auth/session';
import { ReportForm } from '@/components/report/report-form';

export const metadata = { title: 'Report an issue' };
export const dynamic = 'force-dynamic';

export default async function ReportPage() {
  const [portals, user] = await Promise.all([
    prisma.portal.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        categories: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true },
        },
      },
    }),
    getSessionUser(),
  ]);
  const env = getEnv();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">Report an issue</h1>
      <p className="mt-2 text-sm text-ink-600">
        {user
          ? `Signed in as ${user.name}. We will use your account details.`
          : 'No account needed. Fields marked with an asterisk are required.'}
      </p>

      <div className="mt-8 rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
        <ReportForm
          portals={portals}
          reporter={user ? { name: user.name, email: user.email } : null}
          maxAttachmentMb={env.MAX_ATTACHMENT_MB}
          maxAttachments={env.MAX_ATTACHMENTS_PER_TICKET}
        />
      </div>
    </div>
  );
}
