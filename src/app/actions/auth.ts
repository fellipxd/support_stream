'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { toActionError, type ActionResult } from '@/lib/errors';
import { prisma } from '@/server/db/client';
import { burnPasswordTime, hashPassword, verifyPassword } from '@/server/auth/password';
import { createUserSession, destroyUserSession } from '@/server/auth/session';
import { enforce } from '@/server/auth/rate-limit';
import { fieldErrorsOf, registerSchema, signInSchema } from '@/server/validation/schemas';
import { logger } from '@/lib/logger';

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === 'string') out[k] = v;
  return out;
}

async function meta() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    userAgent: h.get('user-agent') ?? undefined,
  };
}

export async function signInAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const { ip, userAgent } = await meta();
    await enforce({ key: `signin:${ip}`, limit: 20, windowSeconds: 900 });

    const parsed = signInSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Enter your email and password',
        code: 'VALIDATION_ERROR',
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }
    await enforce({ key: `signin-user:${parsed.data.email}`, limit: 10, windowSeconds: 900 });

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

    // The same response and comparable timing whether or not the account exists (T12).
    if (!user?.passwordHash) {
      await burnPasswordTime(parsed.data.password);
      return { ok: false, error: 'Email or password is incorrect', code: 'INVALID_CREDENTIALS' };
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return {
        ok: false,
        error: 'This account is temporarily locked. Please try again later.',
        code: 'ACCOUNT_LOCKED',
      };
    }
    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      logger.warn('auth.failed_login', { userId: user.id, attempts: failed });
      return { ok: false, error: 'Email or password is incorrect', code: 'INVALID_CREDENTIALS' };
    }
    if (user.status !== 'ACTIVE') {
      return {
        ok: false,
        error: 'This account is not active. Contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
      };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await createUserSession(user.id, { ip, userAgent });
    logger.info('auth.signed_in', { userId: user.id });
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function registerAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const { ip, userAgent } = await meta();
    await enforce({ key: `register:${ip}`, limit: 5, windowSeconds: 3600 });

    const parsed = registerSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Please check the highlighted fields',
        code: 'VALIDATION_ERROR',
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    const organization = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!organization)
      return { ok: false, error: 'Registration is not available yet', code: 'NOT_CONFIGURED' };

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (existing) {
      // Do not confirm which addresses are registered.
      return {
        ok: false,
        error: 'That email cannot be registered. Try signing in instead.',
        code: 'REGISTRATION_FAILED',
      };
    }

    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash: await hashPassword(parsed.data.password),
        roles: { create: { role: 'USER' } },
      },
    });
    await createUserSession(user.id, { ip, userAgent });
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function signOutAction() {
  await destroyUserSession();
  redirect('/');
}
