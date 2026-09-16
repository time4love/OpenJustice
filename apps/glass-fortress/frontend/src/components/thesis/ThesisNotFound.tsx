import { useTranslations } from 'next-intl';

/**
 * THE ONE 404 — docs/gf-ui-flows.md §19 :594, §8 :334: one sentence for a draft, a missing id and a
 * never-published thesis alike, so no answer tells a reader which of the three it was.
 */
export function ThesisNotFound() {
  const t = useTranslations('theses.page');
  return (
    <main className="page-column py-8">
      <p className="text-slate-700">{t('notFound')}</p>
    </main>
  );
}
