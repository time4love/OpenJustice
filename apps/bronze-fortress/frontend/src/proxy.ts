import { createServerClient } from '@supabase/ssr';
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const PROTECTED_SEGMENTS = ['/dashboard', '/intake'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const pathWithoutLocale = pathname.replace(/^\/(he|en)/, '') || '/';

  if (PROTECTED_SEGMENTS.some((seg) => pathWithoutLocale.startsWith(seg))) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {},
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const locale = pathname.split('/')[1] ?? 'he';
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
