'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ProvisionName } from '@/components/thesis/ProvisionName';
import { formatDate } from '@/lib/format';
import type { ThesisRow as Row, ThesisState as State } from '@/types/research';

// ---------------------------------------------------------------------------
// THE RESEARCHER'S THESIS ROW — docs/gf-ui-flows.md §29 :895–:898; UI plan :720–:721.
//
// NOT UI-6'S PUBLIC CARD, which carries no state, no counts and no author mark, and is KEEP. This is the row a
// researcher reads: the claim · the provision · the author · the STATE · unargued n · open gaps n · whether a
// framing is attached, and for a published thesis the public page beside it.
//
// THE STATE IS CALLED, NEVER DERIVED. `state` is the union `publicationState` answers on both reads (A4 :1429
// as ruled), so a page computing DRAFT from `headIsPublished` and a version count would be the second spelling
// that ruling removed. `ThesisState` below maps the kind to its approved word and does nothing else.
// ---------------------------------------------------------------------------

export function ThesisState({ state, locale }: { state: State; locale: string }) {
  const t = useTranslations('research.thesisState');
  const said =
    state.kind === 'PUBLISHED_BEHIND'
      ? t('PUBLISHED_BEHIND', { count: state.versionsAhead })
      : state.kind === 'WITHDRAWN'
        ? t('WITHDRAWN', { date: formatDate(state.at, locale) })
        : t(state.kind);
  return (
    // `dir="auto"` BECAUSE THE WITHDRAWN ARM COMPOSES A DATE INTO HEBREW („הפרסום בוטל ב־{date}"), and a date
    // inside an RTL line that is not isolated reverses when the browser lays it out (§17 :533–:534, A5 :1078).
    // Found by `bidi-isolated` the moment `/research` joined its subject set — the other three arms carry no
    // value at all, which is exactly why a scan and not an eye is what holds this.
    <span data-thesis-state={state.kind} dir="auto" className="text-xs text-ink-muted">
      {said}
    </span>
  );
}

export function ThesisRow({ row, locale }: { row: Row; locale: string }) {
  const t = useTranslations('research.theses');
  return (
    <li data-thesis-row={row.thesisId} className="flex flex-col gap-1 rounded border border-line bg-surface p-3">
      {/* THE CLAIM IS THE ROW (A2 :1268), whole and `dir="auto"` — no truncation and no invented short title. */}
      <span data-claim dir="auto" className="text-sm text-ink">
        {row.claim}
      </span>
      <ProvisionName provision={row.provision} />
      <span className="text-xs text-ink-muted">
        <bdi>{row.author}</bdi>
      </span>
      <ThesisState state={row.state} locale={locale} />
      <span className="text-xs text-ink-muted">{t('unargued', { count: row.unarguedMentions })}</span>
      <span className="text-xs text-ink-muted">{t('openGaps', { count: row.openGaps })}</span>
      <span data-framing-attached={row.framingIds.length > 0} className="text-xs text-ink-muted">
        {row.framingIds.length > 0 ? t('framingAttached') : t('noFraming')}
      </span>
      {/* THE PUBLIC PAGE, for a published thesis — the one link this row has while the working view is being
          built. The thesis id travels in the URL and is never a text node (§4 :167). */}
      {row.publishedVersionId === null ? null : (
        <Link href={`/theses/${row.thesisId}`} className="text-xs text-ink underline">
          {t('publicPage')}
        </Link>
      )}
    </li>
  );
}
