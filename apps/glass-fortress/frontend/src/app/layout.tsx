import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { getLocale } from 'next-intl/server';
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

// A function rather than a static object so `APP_ENV` is read at request time:
// the same build must be able to serve production and staging.
export async function generateMetadata(): Promise<Metadata> {
  // "Glass Fortress" is internal/backend naming only — never user-facing,
  // including in link previews (WhatsApp, social shares).
  const title = 'צדק לעם - תיק הקורונה';
  const description =
    'AI-powered legal evidence discovery & accountability platform for the Covid-19 class-action lawsuit.';

  return {
    metadataBase,
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: title,
      locale: 'he_IL',
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
