import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { SignInForm } from '@/components/auth/auth-forms';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect('/dashboard');

  // Only same-origin relative paths are honoured, so the parameter cannot be used as an
  // open redirect (docs/SECURITY_MODEL.md).
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined;

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <h1 className="text-lg font-bold text-ink-900">Sign in</h1>
      <p className="mt-1 mb-5 text-sm text-ink-600">Access your tickets and dashboard.</p>
      <SignInForm next={safeNext} />
      <p className="mt-5 text-sm text-ink-600">
        No account?{' '}
        <Link href="/register" className="font-medium text-brand-600 hover:underline">
          Create one
        </Link>
        , or{' '}
        <Link href="/report" className="font-medium text-brand-600 hover:underline">
          report an issue without signing in
        </Link>
        .
      </p>
    </div>
  );
}
