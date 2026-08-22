// ---------------------------------------------------------------------------
// Public frontend URLs, built in one place.
//
// The frontend is next-intl with localePrefix 'always', so EVERY public path
// carries a locale segment — `/he/call/<id>`, never `/call/<id>`. Constructing
// these by hand at each call site is how the OAuth `returnTo` ended up with a
// doubled prefix (`/he/he/...`) in 2026-08-19.
//
// Locales and default mirror apps/glass-fortress/frontend/src/i18n/routing.ts.
// ---------------------------------------------------------------------------

export const LOCALES = ['he', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'he';

/** Trailing slashes are stripped so joins never produce a doubled separator. */
function frontendBase(): string {
  const base = process.env['FRONTEND_URL'] ?? 'http://localhost:3001';
  return base.replace(/\/+$/, '');
}

/**
 * Absolute public URL for a locale-prefixed path.
 *
 * @param path Path WITHOUT a locale segment, e.g. `/call/abc123`.
 */
export function publicUrl(path: string, locale: Locale = DEFAULT_LOCALE): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${frontendBase()}/${locale}${normalized}`;
}

export const routing = {
  /**
   * The public Call for Whistleblowers page for a thesis, in every locale.
   * `canonical` is the default-locale URL — the one to circulate.
   */
  callUrls(thesisId: string): { canonical: string } & Record<Locale, string> {
    const byLocale = Object.fromEntries(
      LOCALES.map((locale) => [locale, publicUrl(`/call/${thesisId}`, locale)]),
    ) as Record<Locale, string>;

    return { canonical: byLocale[DEFAULT_LOCALE], ...byLocale };
  },
};
