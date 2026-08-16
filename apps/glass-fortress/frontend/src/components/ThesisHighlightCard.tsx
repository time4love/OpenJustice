import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { StrengthBadge } from '@/components/StrengthBadge';

export interface ThesisSummary {
  id: string;
  title: string | null;
  createdAt: string;
  openGapCount: number;
  headVersion: {
    id: string;
    status: string;
    preview: string;
    mentionCount: number;
    strength: string | null;
    createdAt: string;
  } | null;
}

interface ThesisHighlightCardProps {
  thesis: ThesisSummary;
  featured?: boolean;
  t: ReturnType<typeof useTranslations<'home'>>;
}

export function ThesisHighlightCard({ thesis, featured = false, t }: ThesisHighlightCardProps) {
  const strength = thesis.headVersion?.strength;

  return (
    <Link
      href={`/call/${thesis.id}`}
      className={
        featured
          ? 'group flex flex-col bg-white border border-slate-200 rounded-2xl p-8 gap-4 hover:border-slate-400 hover:shadow-lg transition-all'
          : 'group flex flex-col bg-white border border-slate-200 rounded-xl p-5 gap-3 hover:border-slate-400 hover:shadow-md transition-all'
      }
    >
      {featured && (
        <span className="self-start px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-900 text-white uppercase tracking-widest">
          {t('topThesesFeaturedLabel')}
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <h3 className={featured ? 'text-xl font-bold text-slate-900 leading-snug' : 'text-sm font-semibold text-slate-900 leading-snug'}>
          {thesis.title ?? t('noTitle')}
        </h3>
        {strength && <StrengthBadge strength={strength} />}
      </div>

      {thesis.headVersion?.preview && (
        <p
          className={
            featured
              ? 'text-sm text-slate-600 line-clamp-5 leading-relaxed flex-1'
              : 'text-xs text-slate-500 line-clamp-3 leading-relaxed flex-1'
          }
        >
          {thesis.headVersion.preview}
        </p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
        {thesis.openGapCount > 0 ? (
          <span className="text-xs font-medium text-red-600">
            {t('warBoardGaps', { count: thesis.openGapCount })}
          </span>
        ) : (
          <span />
        )}
        <span className="text-xs text-blue-600 font-medium group-hover:underline">
          {t('warBoardView')} →
        </span>
      </div>
    </Link>
  );
}
