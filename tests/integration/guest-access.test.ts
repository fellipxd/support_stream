import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTicket } from '@/server/tickets/service';
import { issueGuestToken, revokeGuestTokens } from '@/server/auth/guest-access';
import { generateToken, hashToken, safeCompare } from '@/server/auth/tokens';
import { consume } from '@/server/auth/rate-limit';
import { prisma, makeWorld, reportInput, resetDatabase, SYSTEM } from '../factories';

/** docs/SECURITY_MODEL.md T2, T3 — guest tokens, exchange, replay and enumeration. */

// The exchange sets a cookie, which needs Next's request scope; the cookie write is the only
// part not exercised here, so it is stubbed and everything around it is tested for real.
vi.mock('@/server/auth/session', () => ({
  createGuestSession: vi.fn().mockResolvedValue(undefined),
}));

let world: Awaited<ReturnType<typeof makeWorld>>;

beforeEach(async () => {
  await resetDatabase();
  world = await makeWorld();
});

async function ticketWithToken() {
  const ticket = await createTicket(SYSTEM, reportInput(world.portal.id));
  const token = await issueGuestToken(ticket.id, '10.0.0.1');
  return { ticket, token };
}

describe('token generation', () => {
  it('produces 256 bits of entropy, URL-safe', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('never repeats', () => {
    expect(new Set(Array.from({ length: 200 }, generateToken)).size).toBe(200);
  });

  it('stores only the hash, never the token', async () => {
    const { token } = await ticketWithToken();
    const stored = await prisma.guestAccessToken.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
    });
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('compares digests in constant time and rejects mismatched lengths', () => {
    const digest = hashToken('a');
    expect(safeCompare(digest, digest)).toBe(true);
    expect(safeCompare(digest, hashToken('b'))).toBe(false);
    expect(safeCompare(digest, 'short')).toBe(false);
  });
});

describe('token exchange', () => {
  it('opens the right ticket for a valid token', async () => {
    const { ticket, token } = await ticketWithToken();
    const { exchangeGuestToken } = await import('@/server/auth/guest-access');
    const result = await exchangeGuestToken(token, '10.0.0.1');
    expect(result).toMatchObject({ ticketId: ticket.id, ticketKey: ticket.key });
  });

  it('marks a token used, so a leaked link in history is inert', async () => {
    const { token } = await ticketWithToken();
    const { exchangeGuestToken } = await import('@/server/auth/guest-access');
    await exchangeGuestToken(token, '10.0.0.1');

    const stored = await prisma.guestAccessToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(stored.usedAt).not.toBeNull();
  });

  it('rejects an invented token', async () => {
    const { exchangeGuestToken } = await import('@/server/auth/guest-access');
    await expect(exchangeGuestToken(generateToken(), '10.0.0.2')).rejects.toThrow(
      /no longer valid/i,
    );
  });

  it('rejects a tampered token', async () => {
    const { token } = await ticketWithToken();
    const { exchangeGuestToken } = await import('@/server/auth/guest-access');
    const tampered = `${token.slice(0, -2)}XY`;
    await expect(exchangeGuestToken(tampered, '10.0.0.3')).rejects.toThrow(/no longer valid/i);
  });

  it('rejects an expired token', async () => {
    const { token } = await ticketWithToken();
    await prisma.guestAccessToken.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const { exchangeGuestToken } = await import('@/server/auth/guest-access');
    await expect(exchangeGuestToken(token, '10.0.0.4')).rejects.toThrow(/no longer valid/i);
  });

  it('rejects a revoked token', async () => {
    const { ticket, token } = await ticketWithToken();
    expect(await revokeGuestTokens(ticket.id)).toBeGreaterThan(0);
    const { exchangeGuestToken } = await import('@/server/auth/guest-access');
    await expect(exchangeGuestToken(token, '10.0.0.5')).rejects.toThrow(/no longer valid/i);
  });

  it('gives the same message whatever the reason, so nothing is disclosed', async () => {
    const { token } = await ticketWithToken();
    await prisma.guestAccessToken.update({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });
    const { exchangeGuestToken } = await import('@/server/auth/guest-access');

    const revoked = await exchangeGuestToken(token, '10.0.0.6').catch((e: Error) => e.message);
    const missing = await exchangeGuestToken(generateToken(), '10.0.0.6').catch(
      (e: Error) => e.message,
    );
    expect(revoked).toBe(missing);
  });

  it('cannot be used to reach a different ticket', async () => {
    const first = await ticketWithToken();
    const second = await ticketWithToken();
    const { exchangeGuestToken } = await import('@/server/auth/guest-access');

    const result = await exchangeGuestToken(first.token, '10.0.0.7');
    expect(result.ticketId).toBe(first.ticket.id);
    expect(result.ticketId).not.toBe(second.ticket.id);
  });

  it('throttles repeated attempts from one address', async () => {
    const { exchangeGuestToken } = await import('@/server/auth/guest-access');
    const ip = '10.0.0.99';
    for (let i = 0; i < 20; i++) {
      await exchangeGuestToken(generateToken(), ip).catch(() => undefined);
    }
    await expect(exchangeGuestToken(generateToken(), ip)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});

describe('rate limiting', () => {
  it('allows up to the limit and then refuses', async () => {
    const spec = { key: `test-${Date.now()}`, limit: 3, windowSeconds: 60 };
    expect((await consume(spec)).allowed).toBe(true);
    expect((await consume(spec)).allowed).toBe(true);
    expect((await consume(spec)).allowed).toBe(true);

    const blocked = await consume(spec);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('keeps separate counters per key', async () => {
    const a = { key: `a-${Date.now()}`, limit: 1, windowSeconds: 60 };
    const b = { key: `b-${Date.now()}`, limit: 1, windowSeconds: 60 };
    await consume(a);
    expect((await consume(a)).allowed).toBe(false);
    expect((await consume(b)).allowed).toBe(true);
  });

  it('starts a fresh window once the old one has passed', async () => {
    const spec = { key: `window-${Date.now()}`, limit: 1, windowSeconds: 1 };
    await consume(spec);
    expect((await consume(spec)).allowed).toBe(false);

    await prisma.rateLimitBucket.update({
      where: { key: spec.key },
      data: { windowEnd: new Date(Date.now() - 1000) },
    });
    expect((await consume(spec)).allowed).toBe(true);
  });
});
