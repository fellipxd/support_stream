import 'server-only';
import { prisma } from '../db/client';
import { getEnv } from '../config/env';
import { NotFoundError } from '@/lib/errors';
import { enforce } from './rate-limit';
import { generateToken, hashToken } from './tokens';
import { createGuestSession } from './session';
import { logger } from '@/lib/logger';

/**
 * Guest ticket access (docs/SECURITY_MODEL.md §3). The emailed token is exchanged once for a
 * ticket-scoped session cookie and then marked used, so a leaked URL in a browser history,
 * referrer header or forwarded email is inert.
 */

export async function issueGuestToken(ticketId: string, createdIp?: string): Promise<string> {
  const raw = generateToken();
  await prisma.guestAccessToken.create({
    data: {
      ticketId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + getEnv().GUEST_TOKEN_TTL_DAYS * 86_400_000),
      createdIp,
    },
  });
  return raw;
}

export type ExchangeResult = { ticketKey: string; ticketId: string };

export async function exchangeGuestToken(rawToken: string, ip?: string): Promise<ExchangeResult> {
  // Throttle by IP so a leaked ticket key cannot be paired with token guessing (T2).
  await enforce({ key: `guest-exchange:${ip ?? 'unknown'}`, limit: 20, windowSeconds: 600 });

  const record = await prisma.guestAccessToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      ticket: {
        select: {
          id: true,
          key: true,
          guestReporterId: true,
          guestReporter: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  const now = new Date();
  if (!record || record.revokedAt || record.expiresAt < now) {
    // Never disclose which of the three conditions failed.
    logger.warn('guest.token_rejected', { ip });
    throw new NotFoundError('This link is no longer valid. Please request a new one.');
  }

  const guest = record.ticket.guestReporter;
  if (!guest) throw new NotFoundError('This link is no longer valid.');

  await prisma.guestAccessToken.update({ where: { id: record.id }, data: { usedAt: now } });
  await createGuestSession(record.ticket.id, guest.id, guest.name, guest.email);

  logger.info('guest.session_created', { ticketKey: record.ticket.key });
  return { ticketKey: record.ticket.key, ticketId: record.ticket.id };
}

/** Revokes every outstanding link for a ticket (used when a reporter reports a leak). */
export async function revokeGuestTokens(ticketId: string): Promise<number> {
  const { count } = await prisma.guestAccessToken.updateMany({
    where: { ticketId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}
