import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SiteNav } from './SiteNav';

/**
 * THE NAME, at the top of every page, leading to this site's `/` (docs/gf-ui-flows.md §32 :805–:807; ruled 2026-09-15),
 * then the nav. Mounted once, by `app/[locale]/layout.tsx`; no page renders it (test/navIsTheMap.test.tsx).
 */
export function SiteHeader() {
  const t = useTranslations('common');

  return (
    <header className="site-header border-b border-slate-200">
      <div className="mx-auto flex h-full max-w-5xl items-center gap-2 px-4">
        <Link href="/" className="flex min-w-0 flex-auto items-center gap-2 text-slate-900 hover:opacity-80">
          <Image src="/icon_dove.png" alt="" width={20} height={20} className="h-5 w-5 flex-none" />
          <span className="chrome-name font-semibold">{t('appName')}</span>
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
