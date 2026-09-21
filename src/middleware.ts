import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge concerns only: security headers and an origin check for state-changing requests
 * (docs/SECURITY_MODEL.md T9, §4). Authorisation is never done here — it belongs in the
 * server components and services, where the database is reachable.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // Next.js hydration payload
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

export function middleware(request: NextRequest) {
  const method = request.method.toUpperCase();

  if (method !== 'GET' && method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (origin) {
      const host = request.headers.get('host');
      try {
        if (new URL(origin).host !== host) {
          return new NextResponse('Cross-origin request blocked', { status: 403 });
        }
      } catch {
        return new NextResponse('Bad origin', { status: 400 });
      }
    }
  }

  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', CSP);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
