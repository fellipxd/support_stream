import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { isStaff } from '@/server/authz/policy';
import { AppNav } from '@/components/shell/app-nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  return (
    <AppNav
      user={{ id: user.id, name: user.name, roles: user.roles }}
      staff={isStaff({ kind: 'user', ...user })}
    >
      {children}
    </AppNav>
  );
}
