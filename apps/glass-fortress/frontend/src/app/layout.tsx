import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { hasLocale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { isProduction } from '@/lib/appEnv';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

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

/** The Open Graph locale of each site locale — keyed by routing's own list, so a locale added there without one does not compile. */
const OPEN_GRAPH_LOCALE = { he: 'he_IL', en: 'en_US' } as const satisfies Record<(typeof routing.locales)[number], string>;

// A function rather than a static object so `APP_ENV` and the request's locale are read at request time: the same
// build serves production and staging, in both languages. The name and the one sentence are the approved copy
// (messages/*.json `common.appName`, `metadata.description`), in the locale the request resolved, read once.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (!hasLocale(routing.locales, locale)) {
    throw new Error(`generateMetadata: the request resolved '${locale}', which routing.locales does not name`);
  }
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const dir = locale === 'he' ? 'rtl' : 'ltr';

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
