import type { routing } from '@/i18n/routing';

type Locale = (typeof routing.locales)[number];

// The per-locale facts the document needs, in ONE place, each keyed by routing's own locale list — so a locale added to
// `src/i18n/routing.ts` without its entry here does not compile. Read by `app/[locale]/layout.tsx`.

/** The document's direction per locale — the one place a locale's direction is spelled. */
export const DIRECTION = { he: 'rtl', en: 'ltr' } as const satisfies Record<Locale, 'rtl' | 'ltr'>;

/** The Open Graph locale per site locale. */
export const OPEN_GRAPH_LOCALE = { he: 'he_IL', en: 'en_US' } as const satisfies Record<Locale, string>;
