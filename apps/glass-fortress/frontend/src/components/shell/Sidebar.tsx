'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { ICONS } from '@/components/glyphs';
import { useAuth, type ResearcherProfile } from '@/context/AuthContext';
import { DOORS_OPEN } from '@/lib/doors';
import { RECENTS_KEY, readRecents, recentsOfKind, type Recent } from '@/lib/recents';
import { useStoredString } from './localState';

// ---------------------------------------------------------------------------
// THE SIDEBAR IS THE NAV — docs/gf-ui-flows.md §32 :802–:823 AS AMENDED 2026-09-16; docs/gf-ui-refactor-plan.md
// §9 :1062–:1067; design session §1.1; canvas page 1, boards A, B, C and E.
//
// ONE LIST, keyed by identity, MOVED here from `components/SiteNav.tsx` and not copied — the level function
// below is UI-4's, unchanged in behaviour, and `SiteNav.tsx` is retired in the same commit. Nothing decides an
// entry beside this list. ONE `<nav>` in the document at every width: a drawer from one control on a phone, a
// column from `md`, so there is never a second copy of the list to drift from the first.
//
// „הבית” IS RETIRED AS A CONCEPT (the researcher, 2026-09-16, verbatim: „אין כבר סרגל בראש הדף ובכלל אין
// משמעות ל״בית״ בקונספט החדש. ה״בית״ הוא למעשה מה שרואים לפני שהמשתמש לוחץ על אופצייה בסרגל השמאלי”). The
// SITE NAME at the head is the way to `/`, and `common.nav.home` is gone from both catalogs.
//
// THE TWO CATEGORIES hold what THIS BROWSER has opened, newest watched first, each named as a person
// recognises it — never an id. At UI-4b they are EMPTY on every live route: `lib/recents.ts` ships its reader
// and the pages that will write it are KEEP this round, so UI-5's re-brief lands the writer.
//
// THE LOCALE CONTROL AND THE OPEN-SOURCE LINK sit OUTSIDE the `<nav>`. Neither is a destination in this site's
// map — one is this same page in another language, the other is an external repository — and `nav-is-the-map`
// reads the anchors inside `<nav>` as the whole answer to "where can a reader go from here".
// ---------------------------------------------------------------------------

/** Anonymous (or still loading) · signed in · approved researcher · admin — A3 :1019–:1024, with the researcher's ruling of 2026-09-15 on the signed-in, unapproved account. */
type Level = 0 | 1 | 2 | 3;

type Label = 'corpus' | 'about' | 'safety' | 'researchers' | 'research' | 'admin';

/**
 * The foot's entries, in the board's order: the research pair first, then the public two. `/safety` (הגנה) is
 * drawn WHEN THE DOOR IS LIVE — `lib/doors.ts`, the one constant the document plan's step 32 sets. No sign-in
 * entry (the researcher's ruling, 2026-09-15). The handle entry's text is the profile's handle, not a message.
 */
const FOOT: readonly { href: string; label: Label | 'handle'; from: Level; door?: true }[] = [
  { href: '/research', label: 'research', from: 2 },
  { href: '/profile', label: 'handle', from: 1 },
  { href: '/admin', label: 'admin', from: 3 },
  { href: '/about', label: 'about', from: 0 },
  { href: '/safety', label: 'safety', from: 0, door: true },
  { href: '/researchers', label: 'researchers', from: 0 },
];

/** The one identity function, moved from `SiteNav.tsx`. While the session is restoring, the reader is shown the public set. */
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
    <Link href={pathname} locale={other} lang={other} hrefLang={other} className="shell-item text-ink-muted">
      {t('otherLocale')}
    </Link>
  );
}

function RecentItems({ entries, pathname }: { entries: readonly Recent[]; pathname: string }) {
  return (
    <>
      {entries.map((entry) => (
        <Link
          key={entry.href}
          href={entry.href}
          data-recent-kind={entry.kind}
          aria-current={isCurrent(entry.href, pathname) ? 'page' : undefined}
          className="shell-item"
          // A page is its domain and path, which reads left to right inside a right-to-left list.
          dir={entry.kind === 'page' ? 'ltr' : undefined}
        >
          {entry.label}
        </Link>
      ))}
    </>
  );
}

export function Sidebar() {
  const t = useTranslations('common');
  const chrome = useTranslations('common.chrome');
  const auth = useAuth();
  const pathname = usePathname();
  const level = levelOf(auth);
  const handle = auth.researcher?.handle ?? '';
  // Through the shell's one store: the server snapshot is `null`, so the server and the first client render
  // agree and the list arrives in the same commit as hydration rather than a paint later. Keyed on the RAW
  // string, because a snapshot must be referentially stable and a parsed array is not.
  const raw = useStoredString(RECENTS_KEY);
  const recents = useMemo<Recent[]>(() => (raw === null ? [] : readRecents()), [raw]);

  return (
    <>
      <nav aria-label={t('chrome.navLabel')} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <Link href="/" className="shell-name mb-3">
          <ICONS.house className="h-4 w-4 flex-none" />
          <span className="min-w-0">{t('appName')}</span>
        </Link>

        <span className="shell-category">{t('nav.theses')}</span>
        <RecentItems entries={recentsOfKind('thesis', recents)} pathname={pathname} />

        <span className="shell-category">
          <Link href="/corpus" className="text-ink-muted">
            {t('nav.corpus')}
          </Link>
          <Link href="/corpus/search" aria-label={chrome('search')} className="shell-icon-button">
            <ICONS.search className="h-3.5 w-3.5" />
          </Link>
        </span>
        <RecentItems entries={recentsOfKind('page', recents)} pathname={pathname} />
        <RecentItems entries={recentsOfKind('record', recents)} pathname={pathname} />

        <span className="flex-1" />

        <span className="shell-foot">
          {FOOT.filter((entry) => entry.from <= level && (entry.door !== true || DOORS_OPEN)).map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              aria-current={isCurrent(entry.href, pathname) ? 'page' : undefined}
              className="shell-item"
            >
              {entry.label === 'handle' ? handle : t(`nav.${entry.label}`)}
            </Link>
          ))}
        </span>
      </nav>

      {/* Outside the nav: the same page in another language, and the source code. Neither is a destination. */}
      <span className="flex flex-col gap-0.5 border-t border-line pt-2">
        <LocaleControl />
        <a href="https://github.com/time4love/OpenJustice" className="shell-item text-ink-muted">
          {t('footer.source')}
        </a>
      </span>
    </>
  );
}
