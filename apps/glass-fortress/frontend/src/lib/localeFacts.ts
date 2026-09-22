import type { routing } from '@/i18n/routing';

type Locale = (typeof routing.locales)[number];

// The per-locale facts the document needs, in ONE place, each keyed by routing's own locale list — so a locale added to
// `src/i18n/routing.ts` without its entry here does not compile. Read by `app/[locale]/layout.tsx`.

/** The document's direction per locale — the one place a locale's direction is spelled. */
export const DIRECTION = { he: 'rtl', en: 'ltr' } as const satisfies Record<Locale, 'rtl' | 'ltr'>;

/** The Open Graph locale per site locale. */
export const OPEN_GRAPH_LOCALE = { he: 'he_IL', en: 'en_US' } as const satisfies Record<Locale, string>;

/**
 * A path WITHOUT its locale segment — the bare, locale-agnostic form `returnTo` travels in.
 *
 * IT LIVES HERE BECAUSE IT IS A LOCALE FACT, and because the alternative was a third copy of it: `proxy.ts`
 * :26 spells it as `withoutLocale` and `OAuthInteractionClient.tsx` :41 as `stripLocale`, the second saying in
 * its own comment that it mirrors the first. `lib/researchFetch.ts` needs the same rule for the 401 of every
 * gated page (ui §37 :1037; OAuth plan §7.0f), and one rule with three implementations is the defect this
 * repository names as its dominant one. The two existing callers are NOT re-pointed by this step — they belong
 * to the auth chain, which UI-8 does not touch — and that duplication is reported, not silently left.
 *
 * WHY IT MATTERS: `/auth/callback` pushes `returnTo` through the LOCALE-AWARE router, which prefixes the
 * locale again. A `returnTo` that arrived prefixed comes back as `/he/he/…`, which is a 404 — the failure of
 * OAuth plan §7.0f, found on the first real sign-in.
 */
export function withoutLocale(pathname: string, locales: readonly string[]): string {
  for (const locale of locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix) return '/';
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return pathname;
}
