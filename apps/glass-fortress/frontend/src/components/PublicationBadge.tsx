'use client';

import { useTranslations } from 'next-intl';
import type { PublicationState } from '@/types/thesis';

// ---------------------------------------------------------------------------
// A thesis's publication state at a glance — researcher-facing.
//
// Three states, because publication is a PINNED version: a draft the public
// cannot see; published with the head being what the public sees; and
// published but the public is N versions behind the head, which is the state
// that a boolean flag would have hidden.
// ---------------------------------------------------------------------------

export function PublicationBadge({ publication }: { publication: PublicationState }) {
  const t = useTranslations('theses');

  if (!publication.isPublished) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300">
        {t('publication.draftBadge')}
      </span>
    );
  }

  if (publication.headIsPublished) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300">
        {t('publication.publishedBadge')}
      </span>
    );
  }

  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300">
      {t('publication.behindBadge', { count: publication.versionsAhead })}
    </span>
  );
}
