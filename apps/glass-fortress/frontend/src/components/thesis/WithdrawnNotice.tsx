import { useTranslations } from 'next-intl';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';
import { formatDate } from '@/lib/format';

/**
 * THE NOTICE WHERE A PAGE WAS — docs/gf-ui-flows.md §19 :590–:593; thesis T6 :915–:917. "The disclaimer ·
 * withdrawn by its author on <date> · nothing else — not the text, not the reason, not the claim." No link
 * either: the cited pages stay open through the corpus, and "nothing else" is the contract.
 */
export function WithdrawnNotice({ at, locale }: { at: string; locale: string }) {
  const t = useTranslations('theses.page');
  return (
    <main className="page-column py-8">
      <LegalDisclaimer form="full" />
      <p className="mt-4 text-slate-700">{t('notice', { date: formatDate(at, locale) })}</p>
    </main>
  );
}
