import { Link } from '@/i18n/navigation';
import { StrengthBadge } from '@/components/StrengthBadge';
import type { ThesisSummary } from '@/types/thesis';

interface ThesisHighlightCardLabels {
  noTitle: string;
  gapsLabel?: string; // omit when the thesis has no open gaps
  mentionsLabel: string;
  viewLabel: string;
}

interface ThesisHighlightCardProps {
  thesis: ThesisSummary;
  labels: ThesisHighlightCardLabels;
}

// Decoupled from any specific next-intl namespace — callers resolve their own
// copy into `labels` — because the two pages that render this card (home,
// call) pull their strings from different namespaces with different key
// names ('home' vs 'call'), and a bound `t` function can't cross that.
//
// One design, used identically on both pages — this used to be three
// variants (featured/default/compact) that looked almost the same and only
// duplicated the same two-link structure with different padding. The only
// real visual difference was a "leading case" badge on the homepage's top
// card, dropped rather than kept as a reason to fork the component.
export function ThesisHighlightCard({ thesis, labels }: ThesisHighlightCardProps) {
  const strength = thesis.headVersion?.strength;

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
            // Links to the call-to-action page — where these specific gaps
            // are listed with FOIA-request/tip CTAs to actually close them.
            <Link
              href={`/call/${thesis.id}`}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              {labels.gapsLabel}
            </Link>
          )}
          <span className="text-xs text-slate-400">
            {thesis.headVersion?.mentionCount ?? 0} {labels.mentionsLabel}
          </span>
        </div>
        {/* The full thesis narrative, not the call-to-action page — those are
            two different destinations, not one link doing both. */}
        <Link
          href={`/theses/${thesis.id}`}
          className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
        >
          {labels.viewLabel}
        </Link>
      </div>
    </div>
  );
}
