import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { getAppEnv } from './lib/appEnv';
import { STAGING_ACCESS_COOKIE, isValidAccessToken } from './lib/stagingAccess';

const intlMiddleware = createMiddleware(routing);

const UNLOCK_PATH = '/unlock';

/** The unlock page itself must stay reachable, with or without a locale prefix. */
function isUnlockPath(pathname: string): boolean {
  if (pathname === UNLOCK_PATH) return true;
  return routing.locales.some((locale) => pathname === `/${locale}${UNLOCK_PATH}`);
}

/**
 * Non-production deployments are hidden behind a shared secret. The gate runs
 * before locale routing so an unauthenticated visitor is never served a page,
 * and never learns which routes exist.
 */
function gate(req: NextRequest): NextResponse | null {
  if (getAppEnv() === 'production') return null;
  if (isUnlockPath(req.nextUrl.pathname)) return null;

  const secret = process.env.STAGING_ACCESS_SECRET;
  if (!secret) {
    // Fail closed. A staging deploy with no secret configured must not fall
    // back to serving the site publicly — that is the state this gate exists
    // to end.
    return new NextResponse('Staging access is not configured.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (isValidAccessToken(req.cookies.get(STAGING_ACCESS_COOKIE)?.value, secret)) return null;

  const url = req.nextUrl.clone();
  url.pathname = UNLOCK_PATH;
  // Drop the query string rather than carrying it to the unlock page: it can
  // hold search terms, and returning to it would need open-redirect handling.
  url.search = '';
  return NextResponse.redirect(url);
}

export function proxy(req: NextRequest) {
  return gate(req) ?? intlMiddleware(req);
}

export const config = {
  // Everything except the API proxy, Next.js internals, and any path that looks
  // like a file — metadata routes (`/icon.png`, `/robots.txt`) and anything
  // under `public/`. Without the file exclusion, locale routing rewrites them
  // to `/he/icon.png` and they 404.
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
