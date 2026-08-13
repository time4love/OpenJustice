import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { getLocale } from 'next-intl/server';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const frankRuhlLibre = localFont({
  src: './fonts/frank-ruhl-libre-he.woff2',
  variable: '--font-frank-ruhl',
  weight: '700 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Glass Fortress — Evidence Vault',
  description:
    'AI-powered legal evidence discovery & accountability platform for the Covid-19 class-action lawsuit.',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const dir = locale === 'he' ? 'rtl' : 'ltr';

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} ${frankRuhlLibre.variable} h-full`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
