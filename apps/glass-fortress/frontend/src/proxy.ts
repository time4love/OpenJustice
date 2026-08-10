import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export function proxy(req: NextRequest) {
  return intlMiddleware(req);
}

export const config = {
  // Run on all routes except: api, static files, Next.js internals, favicon
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
