import { useTranslations } from 'next-intl';

/**
 * THE LEGAL DISCLAIMER — COMPLIANCE.md "Required UI Elements" :88–:99: it appears on every thesis page and every
 * `/call/[thesisId]` page. Its FULL form is COMPLIANCE.md's text VERBATIM, in the page's language, and it is not
 * copy: nobody drafts it (`common.disclaimer.full`, compared byte for byte at the step that lands it).
 *
 * Its SHORT form is the LAST element of each page that renders a thesis or an appeal (docs/gf-ui-flows.md
 * §32 :813–:815; §17.8, §20.6) — never the footer's, which cannot know what page it sits under.
 *
 * WHAT THIS COMPONENT NO LONGER CARRIES: rule 3's "ניתוח AI" label and the review status pill. A public page has
 * no model voice at all (§16 :517–:521), so the label belongs to the labelled opinion container UI-7 builds.
 */
export function LegalDisclaimer({ form }: { form: 'full' | 'short' }) {
  const t = useTranslations('common.disclaimer');
  return (
    <aside dir="auto" className="rounded-xl border border-line bg-paper px-4 py-3 text-xs leading-relaxed text-ink-muted">
      {t(form)}
    </aside>
  );
}
