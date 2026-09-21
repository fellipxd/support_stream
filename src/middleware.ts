import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge concerns only: security headers and an origin check for state-changing requests
 * (docs/SECURITY_MODEL.md T9, §4). Authorisation is never done here — it belongs in the
 * server components and services, where the database is reachable.
 */
// The webpack dev server's fast-refresh runtime bundles with an eval-based devtool, so dev
// needs 'unsafe-eval' to hydrate at all; production builds don't use eval and stay strict.
const scriptSrc =
  process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const CSP = [
  "default-src 'self'",
  scriptSrc, // Next.js hydration payload
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
  const requestHeaders = new Headers(request.headers);

  if (method !== 'GET' && method !== 'HEAD') {
    // Prefer Sec-Fetch-Site: it isn't affected by Referrer-Policy, unlike Origin, which the
    // browser blanks to "null" on same-origin *navigations* (e.g. this sign-in form's POST)
    // because of the no-referrer policy below (kept for T3 — guest token leakage).
    const site = requestHeaders.get('sec-fetch-site');
    const host = requestHeaders.get('host');
    if (site) {
      if (site !== 'same-origin' && site !== 'none') {
        return new NextResponse('Cross-origin request blocked', { status: 403 });
      }
      // Next.js's own Server Actions CSRF check does `new URL(origin)` with no try/catch and
      // crashes on the literal "null" — rewrite it now that Sec-Fetch-Site has already
      // confirmed the request is same-origin.
      if (requestHeaders.get('origin') === 'null' && host) {
        requestHeaders.set('origin', `${request.nextUrl.protocol}//${host}`);
      }
    } else {
      const origin = requestHeaders.get('origin');
      if (origin) {
        try {
          if (new URL(origin).host !== host) {
            return new NextResponse('Cross-origin request blocked', { status: 403 });
          }
        } catch {
          return new NextResponse('Bad origin', { status: 400 });
        }
      }
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
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
