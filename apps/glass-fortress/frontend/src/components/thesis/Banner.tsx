import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * THE VERSION PAGE'S BANNER — docs/gf-ui-flows.md §19 :595–:597: "a previous published version; the current one is
 * here". It stands after the statement and the disclaimer, which COMPLIANCE.md rule 5 puts first on every thesis
 * page (the researcher's ruling q3, 2026-09-16).
 */
export function Banner({ thesisId }: { thesisId: string }) {
  const t = useTranslations('theses.version');
  return (
    <p className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink">
      {t('banner')}{' '}
      <Link href={`/theses/${thesisId}`} className="underline">
        {t('toCurrent')}
      </Link>
    </p>
  );
}
