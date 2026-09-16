'use client';

import { useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { useAuth, type ResearcherProfile } from '@/context/AuthContext';
import { DOORS_OPEN } from '@/lib/doors';

// ---------------------------------------------------------------------------
// THE NAV — docs/gf-ui-flows.md §32 :808–:812; §4 :152–:161 (mobile first).
//
// ONE LIST, keyed by identity. Nothing decides an entry beside it: the rendered entries are the list filtered by
// one level, read from AuthContext by one function. ONE <nav> in the document at every width — a sheet from one
// control on a phone, a row from `md` — so there is never a second copy of the list to drift from the first.
// test/navIsTheMap.test.tsx holds the set and its order per identity.
// ---------------------------------------------------------------------------

/** Anonymous (or still loading) · signed in · approved researcher · admin — A3 :1019–:1024, with the researcher's ruling of 2026-09-15 on the signed-in, unapproved account. */
type Level = 0 | 1 | 2 | 3;

type Label = 'home' | 'corpus' | 'about' | 'safety' | 'researchers' | 'research' | 'admin';

/**
 * §32 :808–:810, in its order. `/safety` (הגנה) is drawn WHEN THE DOOR IS LIVE — `lib/doors.ts`, the one constant the
 * document plan's step 32 sets (UI plan :416–:417; the researcher's ruling Q1 (a), 2026-09-16). No sign-in entry (the
 * researcher's ruling, 2026-09-15). The handle entry's text is the profile's handle, not a message.
 */
const NAV: readonly { href: string; label: Label | 'handle'; from: Level; door?: true }[] = [
  { href: '/', label: 'home', from: 0 },
  { href: '/corpus', label: 'corpus', from: 0 },
  { href: '/about', label: 'about', from: 0 },
  { href: '/safety', label: 'safety', from: 0, door: true },
  { href: '/researchers', label: 'researchers', from: 0 },
  { href: '/research', label: 'research', from: 2 },
  { href: '/profile', label: 'handle', from: 1 },
  { href: '/admin', label: 'admin', from: 3 },
];

/** The one identity function. While the session is restoring, the reader is shown the public set. */
function levelOf({ researcher, loading }: { researcher: ResearcherProfile | null; loading: boolean }): Level {
  if (loading || researcher === null) return 0;
  if (!researcher.approved) return 1;
  return researcher.role === 'ADMIN' ? 3 : 2;
}

function isCurrent(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** The same path under the other locale — an address, never a server preference (§39 :922). */
function LocaleControl() {
  const t = useTranslations('common.chrome');
  const current = useLocale();
  const pathname = usePathname();
  const other = routing.locales.find((locale) => locale !== current);
  if (other === undefined) throw new Error('LocaleControl: routing.locales has no second locale');
  return (
    <Link href={pathname} locale={other} lang={other} hrefLang={other} className="flex-none text-sm text-slate-600 hover:text-slate-900">
      {t('otherLocale')}
    </Link>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {open ? (
        <path d="M18 6 6 18M6 6l12 12" />
      ) : (
        <path d="M3 6h18M3 12h18M3 18h18" />
      )}
    </svg>
  );
}

export function SiteNav() {
  const t = useTranslations('common');
  const auth = useAuth();
  const pathname = usePathname();
  const navId = useId();
  const [open, setOpen] = useState(false);
  const level = levelOf(auth);
  const handle = auth.researcher?.handle ?? '';

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <nav
        id={navId}
        aria-label={t('chrome.navLabel')}
        className={`sheet ${open ? 'flex' : 'hidden'} flex-col gap-1 p-4 shadow-lg md:static md:flex md:flex-row md:items-center md:gap-1 md:overflow-visible md:rounded-none md:bg-transparent md:p-0 md:shadow-none`}
      >
        {NAV.filter((entry) => entry.from <= level && (entry.door !== true || DOORS_OPEN)).map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            onClick={() => setOpen(false)}
            aria-current={isCurrent(entry.href, pathname) ? 'page' : undefined}
            className="rounded-lg px-3 py-3 text-sm text-slate-700 hover:bg-slate-100 aria-[current=page]:font-semibold aria-[current=page]:text-slate-900 md:py-1.5"
          >
            {entry.label === 'handle' ? handle : t(`nav.${entry.label}`)}
          </Link>
        ))}
      </nav>
      <LocaleControl />
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={navId}
        aria-label={t(open ? 'chrome.closeNav' : 'chrome.openNav')}
        className="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
      >
        <MenuIcon open={open} />
      </button>
    </>
  );
}
