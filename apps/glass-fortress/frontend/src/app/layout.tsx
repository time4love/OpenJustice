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

// A function rather than a static object so `APP_ENV` is read at request time:
// the same build must be able to serve production and staging.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Glass Fortress — Evidence Vault',
    description:
      'AI-powered legal evidence discovery & accountability platform for the Covid-19 class-action lawsuit.',
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
