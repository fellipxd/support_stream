import { NextResponse, type NextRequest } from 'next/server';
import { exchangeGuestToken } from '@/server/auth/guest-access';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Magic-link exchange. The token in the URL is swapped once for a ticket-scoped session
 * cookie and then marked used, so the link in a browser history or forwarded email is inert
 * (docs/SECURITY_MODEL.md §3). The token is never logged.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  try {
    const { ticketKey } = await exchangeGuestToken(token, ip);
    const response = NextResponse.redirect(new URL(`/tickets/${ticketKey}`, request.url));
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    const status = isAppError(error) ? error.httpStatus : 500;
    logger.warn('guest.exchange_failed', { status });
    return NextResponse.redirect(new URL('/link-expired', request.url));
  }
}
