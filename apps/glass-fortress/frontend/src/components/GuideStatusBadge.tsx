import { useTranslations } from 'next-intl';
import type { GuideStatus } from '@/lib/guide';

/**
 * The help centre's maturity marker. `draft` is the honest default: a page
 * becomes `verified` only once a later phase has actually depended on it.
 */
export function GuideStatusBadge({ status }: { status: GuideStatus }) {
  const t = useTranslations('guide');
  const verified = status === 'verified';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
        verified
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-amber-50 text-amber-700 border-amber-200'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${verified ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {verified ? t('statusVerified') : t('statusDraft')}
    </span>
  );
}
