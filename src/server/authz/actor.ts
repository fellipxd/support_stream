import type { RoleName } from '@prisma/client';

/** Who is making a request. Never trusted from the client; always derived server-side. */
export type Actor =
  | {
      kind: 'user';
      id: string;
      name: string;
      email: string;
      roles: RoleName[];
      organizationId: string;
    }
  | { kind: 'guest'; ticketId: string; guestReporterId: string; email: string; name: string }
  | { kind: 'system' };

export function isUser(a: Actor): a is Extract<Actor, { kind: 'user' }> {
  return a.kind === 'user';
}
export function isGuest(a: Actor): a is Extract<Actor, { kind: 'guest' }> {
  return a.kind === 'guest';
}

export function actorLabel(a: Actor): string {
  if (a.kind === 'user') return a.name;
  if (a.kind === 'guest') return a.name;
  return 'System';
}

export function actorId(a: Actor): string | null {
  if (a.kind === 'user') return a.id;
  if (a.kind === 'guest') return a.guestReporterId;
  return null;
}
