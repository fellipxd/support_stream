import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { RoleName } from '@prisma/client';
import { getEnv } from '../config/env';
import { prisma } from '../db/client';
import type { Actor } from '../authz/actor';
import { generateToken, hashToken } from './tokens';

/**
 * Sessions are signed, HttpOnly cookies (docs/SECURITY_MODEL.md T13). The JWT carries only an
 * opaque session id — roles are always re-read from the database, so a stale or forged claim
 * can never grant privileges (T5).
 */
export const USER_COOKIE = 'ss_session';
export const GUEST_COOKIE = 'ss_guest';

function secret() {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

async function sign(payload: Record<string, unknown>, expiresIn: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

async function verify<T extends Record<string, unknown>>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  } catch {
    return null;
  }
}

const SESSION_DAYS = 7;

export async function createUserSession(
  userId: string,
  meta?: { ip?: string; userAgent?: string },
) {
  const raw = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    },
  });
  const jwt = await sign({ sid: raw, uid: userId }, `${SESSION_DAYS}d`);
  const store = await cookies();
  store.set(USER_COOKIE, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroyUserSession() {
  const store = await cookies();
  const jwt = store.get(USER_COOKIE)?.value;
  if (jwt) {
    const payload = await verify<{ sid: string }>(jwt);
    if (payload?.sid) {
      await prisma.userSession.updateMany({
        where: { tokenHash: hashToken(payload.sid), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
  store.delete(USER_COOKIE);
  store.delete(GUEST_COOKIE);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  roles: RoleName[];
  organizationId: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const jwt = store.get(USER_COOKIE)?.value;
  if (!jwt) return null;
  const payload = await verify<{ sid: string; uid: string }>(jwt);
  if (!payload?.sid) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(payload.sid) },
    include: { user: { include: { roles: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== 'ACTIVE') return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    roles: session.user.roles.map((r) => r.role),
    organizationId: session.user.organizationId,
  };
}

/** A guest session is bound to exactly one ticket and cannot reach any other (T1, T3). */
export async function createGuestSession(
  ticketId: string,
  guestReporterId: string,
  name: string,
  email: string,
) {
  const hours = getEnv().GUEST_SESSION_TTL_HOURS;
  const jwt = await sign({ tid: ticketId, gid: guestReporterId, name, email }, `${hours}h`);
  const store = await cookies();
  store.set(GUEST_COOKIE, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(Date.now() + hours * 3_600_000),
  });
}

export async function getGuestSession(): Promise<Extract<Actor, { kind: 'guest' }> | null> {
  const store = await cookies();
  const jwt = store.get(GUEST_COOKIE)?.value;
  if (!jwt) return null;
  const payload = await verify<{ tid: string; gid: string; name: string; email: string }>(jwt);
  if (!payload?.tid) return null;
  return {
    kind: 'guest',
    ticketId: payload.tid,
    guestReporterId: payload.gid,
    name: payload.name,
    email: payload.email,
  };
}

/** The current actor: authenticated user first, then a ticket-scoped guest. */
export async function getActor(): Promise<Actor | null> {
  const user = await getSessionUser();
  if (user) return { kind: 'user', ...user };
  return await getGuestSession();
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    const { UnauthorizedError } = await import('@/lib/errors');
    throw new UnauthorizedError();
  }
  return actor;
}

export async function requireUser(): Promise<Extract<Actor, { kind: 'user' }>> {
  const user = await getSessionUser();
  if (!user) {
    const { UnauthorizedError } = await import('@/lib/errors');
    throw new UnauthorizedError();
  }
  return { kind: 'user', ...user };
}
