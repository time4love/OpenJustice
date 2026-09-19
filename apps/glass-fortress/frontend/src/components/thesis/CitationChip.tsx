'use client';

import { useTranslations } from 'next-intl';
import type { Citation, EvidenceCitation, TrajectoryCitation } from '@/types/thesis';
import { Tick, tickFace } from './Tick';
import { useOpenRecord } from './PaneTabs';

// ---------------------------------------------------------------------------
// THE CITATION IN THE TEXT — docs/gf-ui-flows.md §17 :532–:538, §18 as amended 2026-09-16, §4 :167–:178;
// docs/gf-ui-refactor-plan.md §10 :1121–:1124.
//
// IT IS NOW A DATED TICK, and the two things that left it are the point:
//   · THE MARKS' WORDS went to the RECORD (§10 :1122; the researcher's Q4, CONFIRMED 2026-09-17).
//     „מאומת מול העוגן” and „נטען בדיון” used to render INLINE, four times each, in the same face,
//     size and weight as the sentence they judged — the third of the three separations the reading
//     test found missing. What stands in the sentence now is a date and ONE coloured dot.
//   · THE DOMAIN went UP to the TICK LINE (§10 :1121), which heads the page with it once instead of
//     repeating it at every citation.
//
// AND THE PRESS OPENS THE RECORD AS A RIGHT-PANE TAB, not a sheet over the text (§18 as amended: "the
// citation record opens as a right-pane tab at width and full-screen on the phone"; §22 as amended:
// "at width the record is a right-pane tab, not a margin panel"). The sheet this component used to
// carry is gone with it — `components/Sheet.tsx` is untouched and still serves every dialog, the
// letter's included; what changed is WHERE a record opens, which is the amended design's whole point.
//
// THE VERSION PAGE'S TWO EXTRA KINDS are unchanged (the researcher's ruling M4, 2026-09-16): on a
// previous version a record the CURRENT version cites at another pinned content version is `repinned`
// — its facts shown, its marks NOT, because a mark belongs to the pin it was computed for — and a
// record the current version no longer cites is `not-current`, which shows nothing about the record.
// ---------------------------------------------------------------------------

export type ChipKind = 'capture' | 'diff' | 'trajectory' | 'unresolved' | 'repinned' | 'not-current';

export interface ChipProps {
  kind: ChipKind;
  /** The record's name or the trajectory's id — an attribute for the instruments, never a text node. */
  name: string;
  /** The token as it stands in the text, for the record's COPY (§4 :172–:173). */
  source: string;
  citation?: Citation;
  /** The cited page's id, when the body's `pages` names it — the record's link onward (§18 :575). */
  pageId?: string;
  locale: string;
}

const isEvidence = (citation: Citation | undefined): citation is EvidenceCitation => citation?.kind === 'EVIDENCE';
const isTrajectory = (citation: Citation | undefined): citation is TrajectoryCitation => citation?.kind === 'TRAJECTORY';

export function CitationChip({ kind, name, source, citation, locale }: ChipProps) {
  const t = useTranslations('theses');
  const openRecord = useOpenRecord();
  const face = tickFace(citation, locale);

  const label = ((): React.ReactNode => {
    if (kind === 'unresolved') return t('chip.unresolved');
    if (kind === 'not-current') return t('chip.notCurrent');
    if (!isEvidence(citation) && !isTrajectory(citation)) return t('chip.unresolved');
    return (
      <>
        <Tick {...face} />
        {kind === 'repinned' ? ` · ${t('chip.repinned')}` : ''}
      </>
    );
  })();

  // A record that resolves can be OPENED; one that does not is a statement and not a control.
  const openable = citation !== undefined && kind !== 'not-current' && kind !== 'unresolved';

  return (
    <span data-chip={name} data-chip-kind={kind} data-chip-source={source} className="inline-flex items-center">
      <button
        type="button"
        disabled={!openable}
        onClick={() => {
          if (citation !== undefined) openRecord(citation);
        }}
        // A CONTROL MUST LOOK LIKE ONE. The researcher read the built page and asked why the dates are not
        // clickable; measured on `aa00640`, even the live chips reported `cursor: default`, because a
        // `<button>` has no pointer cursor of its own — nothing signalled that a press does anything. The
        // disabled arm keeps the default, since a record that resolves to nothing is a statement (R59 · F3).
        className="mx-0.5 inline-flex cursor-pointer items-center gap-1 rounded border border-line px-1.5 py-0.5 text-xs text-ink disabled:cursor-default disabled:text-ink-muted"
      >
        {label}
      </button>
    </span>
  );
}
