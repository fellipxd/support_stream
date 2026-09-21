import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { RegisterForm } from '@/components/auth/auth-forms';

export const metadata = { title: 'Create an account' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  if (await getSessionUser()) redirect('/dashboard');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-bold text-slate-900">Create an account</h1>
      <p className="mt-1 mb-5 text-sm text-slate-600">
        An account keeps all your tickets in one place. You do not need one to report an issue.
      </p>
      <RegisterForm />
      <p className="mt-5 text-sm text-slate-600">
        Already registered?{' '}
        <Link href="/sign-in" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
