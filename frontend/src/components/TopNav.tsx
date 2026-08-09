'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';

export type NavPage =
  | 'home'
  | 'vault'
  | 'timeline'
  | 'forensics'
  | 'figures'
  | 'theses'
  | 'about'
  | 'researchers'
  | 'call';

type NavLabel =
  | 'nav.home'
  | 'nav.evidenceVault'
  | 'nav.timeline'
  | 'nav.forensics'
  | 'nav.theses'
  | 'nav.calls'
  | 'nav.about';

const NAV_ITEMS: { key: NavPage; href: string; label: NavLabel }[] = [
  { key: 'home', href: '/', label: 'nav.home' },
  { key: 'theses', href: '/theses', label: 'nav.theses' },
  { key: 'call', href: '/call', label: 'nav.calls' },
  { key: 'vault', href: '/vault', label: 'nav.evidenceVault' },
  { key: 'timeline', href: '/timeline', label: 'nav.timeline' },
  { key: 'forensics', href: '/forensics', label: 'nav.forensics' },
  { key: 'about', href: '/about', label: 'nav.about' },
];

export function TopNav({ current }: { current: NavPage }) {
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-3">
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map(({ key, href, label }) =>
          key === current ? (
            <span
              key={key}
              className="px-3 py-1.5 rounded text-xs font-medium bg-slate-900 text-white border border-slate-700"
            >
              {tc(label as Parameters<typeof tc>[0])}
            </span>
          ) : (
            <Link
              key={key}
              href={href}
              className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 border border-transparent hover:bg-slate-100 hover:text-slate-900 hover:border-slate-200 transition-colors"
            >
              {tc(label as Parameters<typeof tc>[0])}
            </Link>
          ),
        )}
      </nav>
      <div className="flex items-center gap-1 text-xs font-mono">
        {(['he', 'en'] as const).map((l) => (
          <button
            key={l}
            onClick={() => router.replace(pathname, { locale: l })}
            className={`px-2 py-1 rounded transition-colors ${
              locale === l ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
