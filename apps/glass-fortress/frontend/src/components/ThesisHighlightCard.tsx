import { Link } from '@/i18n/navigation';
import { StrengthBadge } from '@/components/StrengthBadge';
import type { ThesisSummary } from '@/types/thesis';

interface ThesisHighlightCardLabels {
  noTitle: string;
  featuredLabel?: string; // required when variant="featured"
  gapsLabel?: string; // omit when the thesis has no open gaps
  mentionsLabel?: string; // shown only in variant="compact"
  viewLabel: string;
}

interface ThesisHighlightCardProps {
  thesis: ThesisSummary;
  labels: ThesisHighlightCardLabels;
  variant?: 'featured' | 'default' | 'compact';
}

// Decoupled from any specific next-intl namespace — callers resolve their own
// copy into `labels` — because the two pages that render this card (home,
// call) pull their strings from different namespaces with different key
// names ('home' vs 'call'), and a bound `t` function can't cross that.
export function ThesisHighlightCard({ thesis, labels, variant = 'default' }: ThesisHighlightCardProps) {
  const strength = thesis.headVersion?.strength;

  if (variant === 'compact') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4 hover:border-slate-400 hover:shadow-md transition-all">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-slate-900 text-sm leading-snug">
            {thesis.title ?? labels.noTitle}
          </h3>
          {strength && <StrengthBadge strength={strength} />}
        </div>

        {thesis.headVersion?.preview && (
          <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed flex-1">
            {thesis.headVersion.preview}
          </p>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto gap-3">
          <div className="flex items-center gap-3">
            {labels.gapsLabel && (
              <span className="text-xs font-semibold text-red-600">{labels.gapsLabel}</span>
            )}
            <span className="text-xs text-slate-400">
              {thesis.headVersion?.mentionCount ?? 0} {labels.mentionsLabel}
            </span>
          </div>
          <Link
            href={`/call/${thesis.id}`}
            className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
          >
            {labels.viewLabel}
          </Link>
        </div>
      </div>
    );
  }

  const featured = variant === 'featured';

  return (
    <Link
      href={`/call/${thesis.id}`}
      className={
        featured
          ? 'group relative flex flex-col bg-white border border-slate-200 rounded-2xl p-8 gap-4 overflow-hidden hover:border-amber-300 hover:shadow-xl hover:shadow-amber-900/5 transition-all'
          : 'group flex flex-col bg-white border border-slate-200 rounded-xl p-5 gap-3 hover:border-amber-300 hover:shadow-lg hover:shadow-slate-900/5 transition-all'
      }
    >
      {featured && (
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-red-400" />
      )}
      {featured && (
        <span className="self-start px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-900 text-white uppercase tracking-widest">
          {labels.featuredLabel}
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <h3 className={featured ? 'text-xl font-bold text-slate-900 leading-snug' : 'text-sm font-semibold text-slate-900 leading-snug'}>
          {thesis.title ?? labels.noTitle}
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
        {labels.gapsLabel ? (
          <span className="text-xs font-medium text-red-600">{labels.gapsLabel}</span>
        ) : (
          <span />
        )}
        <span className="text-xs text-blue-600 font-medium group-hover:underline">
          {labels.viewLabel} →
        </span>
      </div>
    </Link>
  );
}
