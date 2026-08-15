'use client';

import { useTranslations } from 'next-intl';
import {
  asInvestigativeCategories,
  categoryStyle,
  type InvestigativeCategory,
} from '@/lib/investigativeCategories';

interface Props {
  /** Raw values from the API — unknown entries are dropped. */
  categories: readonly string[];
  /** Rendered when the evidence advances no concern (e.g. a ContextAnchor). */
  emptyLabel?: string;
  /** Cap the number of chips; the remainder is summarised as "+N". */
  max?: number;
  className?: string;
}

/**
 * Renders an evidence record's investigative concerns.
 *
 * Evidence is classified on a multi-valued axis, so this is 0..n chips rather
 * than a single label. An empty list is meaningful, not missing: a ContextAnchor
 * establishes a baseline without itself advancing any concern.
 */
export function CategoryBadges({ categories, emptyLabel, max, className = '' }: Props) {
  const t = useTranslations('categories');
  const known = asInvestigativeCategories(categories);

  if (known.length === 0) {
    return emptyLabel ? <span className="text-xs text-slate-400">{emptyLabel}</span> : null;
  }

  const shown: InvestigativeCategory[] = max ? known.slice(0, max) : known;
  const hidden = known.length - shown.length;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map((category) => (
        <span
          key={category}
          className={`px-2 py-0.5 rounded text-xs font-medium ${categoryStyle(category)}`}
        >
          {t(category)}
        </span>
      ))}
      {hidden > 0 && (
        <span
          className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200"
          title={known.slice(shown.length).map((c) => t(c)).join(', ')}
        >
          +{hidden}
        </span>
      )}
    </span>
  );
}
