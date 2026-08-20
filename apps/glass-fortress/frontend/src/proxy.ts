import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { getAppEnv } from './lib/appEnv';
import { STAGING_ACCESS_COOKIE, isValidAccessToken } from './lib/stagingAccess';

const intlMiddleware = createMiddleware(routing);

const UNLOCK_PATH = '/unlock';

// Pages an external, no-pre-shared-secret visitor must be able to reach even
// on staging — docs/gf-mcp-oauth-dev-plan.md's OAuth login/consent bridge.
// An MCP client's OAuth flow (or a real researcher logging in) walks
// /oauth/interaction/[uid] (not logged in) -> /login?returnTo=... -> Google
// -> /auth/callback?returnTo=... -> back to /oauth/interaction/[uid], all as
// real browser navigations with no way to carry the staging cookie/header.
// Gating any one of these strands the whole chain behind the staging
// password wall — same reasoning already applied on the backend to
// /oauth/* and /api/mcp (server.ts): the staging secret was never the real
// gate for this flow, Researcher approval is, and that check still applies
// in full at every step regardless of this exemption.
const PUBLIC_ON_STAGING_PATHS = [UNLOCK_PATH, '/login', '/auth/callback'];
const PUBLIC_ON_STAGING_PREFIXES = ['/oauth/interaction/'];

/** Strips a leading /he or /en locale segment, if present. */
function withoutLocale(pathname: string): string {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix) return '/';
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return pathname;
}

function isPublicOnStaging(pathname: string): boolean {
  const bare = withoutLocale(pathname);
  if (PUBLIC_ON_STAGING_PATHS.includes(bare)) return true;
  return PUBLIC_ON_STAGING_PREFIXES.some((prefix) => bare.startsWith(prefix));
}

/**
 * Non-production deployments are hidden behind a shared secret. The gate runs
 * before locale routing so an unauthenticated visitor is never served a page,
 * and never learns which routes exist.
 */
function gate(req: NextRequest): NextResponse | null {
  if (getAppEnv() === 'production') return null;
  if (isPublicOnStaging(req.nextUrl.pathname)) return null;

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
  // to `/he/icon.png` and they 404. `opengraph-image` is a generated metadata
  // route with no extension in its URL, so it needs an explicit exclusion too.
  matcher: ['/((?!api|_next|opengraph-image|.*\\..*).*)'],
};
