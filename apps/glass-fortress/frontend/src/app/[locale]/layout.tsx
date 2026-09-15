import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { ClientProviders } from '@/components/ClientProviders';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { StagingBanner } from '@/components/StagingBanner';
import { isProduction } from '@/lib/appEnv';
import { DIRECTION, OPEN_GRAPH_LOCALE } from '@/lib/localeFacts';
import '../globals.css';

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
 * WHAT EVERY PAGE CARRIES, AND NOTHING MORE (docs/gf-ui-flows.md §32): the header — the name and the nav — the footer
 * and, on staging, the banner. Mounted here once, OUTSIDE every page's `<main>`; no page renders chrome of its own. The
 * header sits inside `ClientProviders` because the nav reads the signed-in identity from `AuthProvider`.
 */
export default async function LocaleLayout({ children, params }: { children: React.ReactNode } & LocaleParams) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages();

  return (
    <html lang={locale} dir={DIRECTION[locale]} className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">
        <NextIntlClientProvider messages={messages}>
          <ClientProviders>
            <SiteHeader />
            {children}
            <SiteFooter />
            <StagingBanner />
          </ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
