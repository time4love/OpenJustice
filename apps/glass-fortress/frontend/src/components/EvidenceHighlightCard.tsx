import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TierBadge, tierAccentColor } from '@/components/TierBadge';
import { CategoryBadges } from '@/components/CategoryBadges';

export interface EvidenceHighlight {
  evidenceId: string;
  fileHash: string;
  summary: string;
  targetEntity: string;
  evidenceTier: string;
  investigativeCategories: string[];
  evidenceDate: string;
  createdAt: string;
}

export function EvidenceHighlightCard({
  evidence,
  t,
}: {
  evidence: EvidenceHighlight;
  t: ReturnType<typeof useTranslations<'home'>>;
}) {
  const locale = useLocale();
  const submittedLabel = new Date(evidence.createdAt).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Link
      href={`/evidence/${evidence.evidenceId}`}
      className="group flex flex-col bg-white border border-slate-200 border-s-4 rounded-xl p-5 gap-3 hover:border-slate-400 hover:shadow-md transition-all"
      style={{ borderInlineStartColor: tierAccentColor(evidence.evidenceTier) }}
    >
      <div className="flex items-start justify-between gap-2">
        <TierBadge tier={evidence.evidenceTier} />
        <span className="text-xs text-slate-400 shrink-0">{submittedLabel}</span>
      </div>

      <span className="px-2 py-0.5 self-start rounded text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
        ⚖ {evidence.targetEntity}
      </span>

      <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed flex-1">
        {evidence.summary}
      </p>

      <CategoryBadges categories={evidence.investigativeCategories} max={3} />

      <div className="flex items-center justify-end pt-2 border-t border-slate-100 mt-auto">
        <span className="text-xs text-blue-600 font-medium group-hover:underline">
          {t('viewEvidence')} →
        </span>
      </div>
    </Link>
  );
}
