import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { ClientProviders } from '@/components/ClientProviders';
import { Shell } from '@/components/shell/Shell';
import { StagingBanner } from '@/components/StagingBanner';
import { isProduction } from '@/lib/appEnv';
import { DIRECTION, OPEN_GRAPH_LOCALE } from '@/lib/localeFacts';
import '../globals.css';

// ---------------------------------------------------------------------------
// THE TWO VOICES, SELF-HOSTED — docs/gf-ui-refactor-plan.md §9 :1076–:1079; design session §1.8.
//
// Frank Ruhl Libre for the researcher's words and headings, Heebo for the chrome and the marks. Both are
// served from this origin through `next/font/local`; no request ever leaves for Google Fonts.
//
// WHY FOUR FILES AND NOT TWO. Each family ships as a Hebrew subset and a Latin one, and the HEBREW subsets
// map ZERO digits — read from their own `cmap`: Frank Ruhl Libre 109 codepoints, Heebo 108, no digit in
// either, though both do carry the maqaf U+05BE that „…מ־{date}” needs. Hebrew headings on this platform are
// full of digits ("בין הצילום מ-28.6.2022…"), so the Latin subset is not an English convenience: without it
// every digit inside a Hebrew claim would be drawn by whatever the system chose, mid-word.
//
// WHY `adjustFontFallback: false` AND `fallback: []` ON ALL FOUR, which is not a detail. Left on,
// `next/font` emits the CSS variable as `'<family>', '<family> Fallback'` and generates a real, matchable
// `@font-face` for that second name whose `src` is `local("Arial")` — or `local("Times New Roman")` for a
// serif, and BOTH of those have digits. That face would then sit between the Hebrew subset and the Latin one
// in the stack and take every digit, and these four files would ship with the very defect they exist to
// prevent. Turning it off costs the metric-adjusted fallback; `globals.css` names a plain final fallback in
// each stack instead. `test/fontsAreLocal.test.ts` holds the options and the order.
// ---------------------------------------------------------------------------

const frankHebrew = localFont({
  src: '../fonts/frank-ruhl-libre-hebrew-wght-normal.woff2',
  weight: '300 900',
  display: 'swap',
  variable: '--font-frank-hebrew',
  adjustFontFallback: false,
  fallback: [],
});

const frankLatin = localFont({
  src: '../fonts/frank-ruhl-libre-latin-wght-normal.woff2',
  weight: '300 900',
  display: 'swap',
  variable: '--font-frank-latin',
  adjustFontFallback: false,
  fallback: [],
});

const heeboHebrew = localFont({
  src: '../fonts/heebo-hebrew-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-heebo-hebrew',
  adjustFontFallback: false,
  fallback: [],
});

const heeboLatin = localFont({
  src: '../fonts/heebo-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-heebo-latin',
  adjustFontFallback: false,
  fallback: [],
});

const FONT_VARIABLES = [frankHebrew.variable, frankLatin.variable, heeboHebrew.variable, heeboLatin.variable].join(' ');

// Without an explicit base, Next.js resolves relative metadata URLs (like the
// og:image the opengraph-image.tsx route convention emits) against the
// container's own address rather than the site's real one — link previews
// (WhatsApp, social shares) then try to fetch an unreachable
// `http://localhost:8080/...` and silently show no image. Railway injects
// `RAILWAY_PUBLIC_DOMAIN` per-service, so this is correct on both staging and
// production without hardcoding either domain.
const metadataBase = process.env.RAILWAY_PUBLIC_DOMAIN
  ? new URL(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`)
  : new URL('http://localhost:3011');

interface LocaleParams {
  params: Promise<{ locale: string }>;
}

// A function rather than a static object so `APP_ENV` is read at request time: the same build serves production and
// staging. The name and the one sentence are the approved copy (messages/*.json `common.appName`,
// `metadata.description`), in this segment's locale — the URL's, never the request config's.
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const common = await getTranslations({ locale, namespace: 'common' });
  const metadata = await getTranslations({ locale, namespace: 'metadata' });
  const title = common('appName');
  const description = metadata('description');

  return {
    metadataBase,
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: title,
      locale: OPEN_GRAPH_LOCALE[locale],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    // Non-production deployments hold unreviewed test data and must never be
    // indexed, even if the access gate is somehow bypassed.
    ...(isProduction() ? {} : { robots: { index: false, follow: false } }),
  };
}

/**
 * THE ROOT LAYOUT, under the locale segment (next docs, file-conventions/layout.md :140–:146): it renders the document,
 * so `<html lang dir>` is re-rendered whenever the locale in the URL changes — a soft navigation between locales included.
 *
 * WHAT EVERY PAGE CARRIES, AND NOTHING MORE (docs/gf-ui-flows.md §32 as amended 2026-09-16): THE SHELL — the sidebar,
 * which IS the nav, the centre, and the tabbed right pane — plus, on staging, the banner. Mounted here ONCE, and the
 * page's own `<main>` is what the centre holds; no page renders chrome of its own (test/navIsTheMap.test.tsx,
 * test/shell.test.tsx). The shell sits inside `ClientProviders` because the sidebar reads the signed-in identity from
 * `AuthProvider` — the one thing in the shell that differs per reader, and the only `AuthContext` import the
 * `two-centres-by-url` scan permits under `components/shell`.
 *
 * The font VARIABLES go on `<html>` rather than a `className`, so `globals.css` composes the two stacks by name in one
 * place and nothing downstream has to know there are four files.
 */
export default async function LocaleLayout({ children, params }: { children: React.ReactNode } & LocaleParams) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages();

  return (
    <html lang={locale} dir={DIRECTION[locale]} className={`${FONT_VARIABLES} h-full`}>
      <body className="min-h-full antialiased">
        <NextIntlClientProvider messages={messages}>
          <ClientProviders>
            <Shell>{children}</Shell>
            <StagingBanner />
          </ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
