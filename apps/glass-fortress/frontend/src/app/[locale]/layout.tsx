import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { ClientProviders } from '@/components/ClientProviders';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { StagingBanner } from '@/components/StagingBanner';

/**
 * WHAT EVERY PAGE CARRIES, AND NOTHING MORE (docs/gf-ui-flows.md §32): the header — the name and the nav — the footer
 * and, on staging, the banner. Mounted here once, OUTSIDE every page's `<main>`; no page renders chrome of its own. The
 * header sits inside `ClientProviders` because the nav reads the signed-in identity from `AuthProvider`.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <ClientProviders>
        <SiteHeader />
        {children}
        <SiteFooter />
        <StagingBanner />
      </ClientProviders>
    </NextIntlClientProvider>
  );
}
