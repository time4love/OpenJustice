'use client';

import { useTranslations } from 'next-intl';
import { DeclareTabs, usePaneLayer, usePaneSelection, type PaneTab } from '@/components/shell/RightPane';
import { domainOf, formatCaptureDate } from '@/lib/format';
import type { Citation, EvidenceCitation, TrajectoryCitation } from '@/types/thesis';
import { EvidenceRecordPane, TrajectoryRecordPane } from './RecordPane';

// ---------------------------------------------------------------------------
// WHAT A PAGE DECLARES INTO THE RIGHT PANE — docs/gf-ui-refactor-plan.md §10 :1124 ("the citation
// record, the call page and a previous version open as RIGHT-PANE TABS at width and full-screen on the
// phone, on the Sheet of UI-4b"); UI-4b §9 :1068–:1070; canvas page 1 board B, page 3 board A.
//
// THE PAGE DECLARES, THE SHELL RENDERS. `<DeclareTabs>` is UI-4b's and is untouched: this file only
// builds the array. The pane's mechanism landed at UI-4b with two fixtures as its only callers — these
// are the first real ones.
//
// A TAB'S LABEL IS WHAT A PERSON RECOGNISES, and it is composed HERE, which is why `no-id-as-text`
// gained a case for it (§10 :1126): a record tab named by its 64-hex name would be the exact defect
// §4 :167 forbids, and the label is the page's to get right, not the shell's.
//
// NO NEW STRING. A record's label is derived — domain · date — and the call's is
// `theses.appeals.heading`, approved and landed since UI-5's first pass.
// ---------------------------------------------------------------------------

/** A record's tab id, stable across renders so a stored active tab survives a navigation back. */
export const recordTabId = (citation: Citation): string => `record:${citation.kind}:${citation.name}`;
export const CALL_TAB_ID = 'call';

/**
 * THE CITATIONS THAT OPEN A RECORD TAB — every kind but a DOCUMENT, whose record in the pane is the document sheet of
 * step 34 (ui §18 :583–:584; board ד2·י's "not drawn"). Its chip is a statement until then (`CitationChip`), so a
 * tab here would be a pane nothing opens and that shows nothing the design has drawn.
 */
const opensARecordTab = (citation: Citation): citation is EvidenceCitation | TrajectoryCitation => citation.kind !== 'DOCUMENT';

function labelOf(citation: EvidenceCitation | TrajectoryCitation, locale: string): string {
  if (citation.kind === 'TRAJECTORY') {
    return citation.resolves ? citation.claimText.split(/\s+/).slice(0, 4).join(' ') : '—';
  }
  const { record } = citation;
  const when =
    record.capture === undefined
      ? `${formatCaptureDate(record.before ?? '', locale)}–${formatCaptureDate(record.after ?? '', locale)}`
      : formatCaptureDate(record.capture, locale);
  return `${domainOf(record.url)} · ${when}`;
}

export interface PaneTabsProps {
  citations: readonly Citation[];
  pages: readonly { trackedUrlId: string; url: string }[];
  locale: string;
  /** The call page's own panel, built by the page and passed through — absent on the version page. */
  call?: React.ReactNode;
}

/**
 * THE RECORD TABS, AS A VALUE — a DECLARED KEEP EDIT, ruled 2026-09-22 (the researcher, R73 „option (a)”).
 *
 * WHY A VALUE AND NOT A SECOND COMPONENT. `RightPane.tsx`'s `declare(tabs)` REPLACES a page's registry; it
 * does not merge, and unmounting clears it. So two `<DeclareTabs>` on one page clobber each other, and the
 * working view — which must show the TRANSCRIPT and every citation's record from ONE declaration — cannot
 * render `<PaneTabs>` beside its own. The shape it needs is an ARRAY, and the precedent is already in the
 * tree: `components/corpus/Stream.tsx` :215 composes a record tab and the extraction slot's tabs into one
 * `DeclareTabs`, with `useRecordTab` (`RecordSheet.tsx` :302) building a tab as a value exactly like this.
 *
 * THE TWO ALTERNATIVES WERE READ OUT AND REJECTED, on the documents rather than on taste: passing the
 * transcript through `call` puts it LAST, and `RightPane.tsx` :116's fallback to `tabs.at(0)` is what makes
 * the transcript §14 :486's default; mapping the citations in the working view would re-spell `labelOf` and
 * the two record panes, which is the second-spelling defect this repository names as its dominant one.
 *
 * NOTHING ABOUT THE PUBLIC PAGE MOVES: `<PaneTabs>` below is the same component with the same props and the
 * same output, now calling what it used to inline. The declared size is in the chunk's report.
 */
export function recordTabs({ citations, pages, locale }: Omit<PaneTabsProps, 'call'>): PaneTab[] {
  return citations.filter(opensARecordTab).map((citation) => ({
    id: recordTabId(citation),
    label: labelOf(citation, locale),
    content:
      citation.kind === 'EVIDENCE' ? (
        <EvidenceRecordPane
          citation={citation}
          pageId={pages.find((page) => page.url === citation.record.url)?.trackedUrlId}
          source={`#ev_${citation.name}`}
          locale={locale}
        />
      ) : (
        <TrajectoryRecordPane citation={citation} source={`#tr_${citation.name}`} />
      ),
  }));
}

export function PaneTabs({ citations, pages, locale, call }: PaneTabsProps) {
  const t = useTranslations('theses.appeals');
  const tabs = recordTabs({ citations, pages, locale });
  if (call !== undefined) tabs.push({ id: CALL_TAB_ID, label: t('heading'), content: call });
  return <DeclareTabs tabs={tabs} />;
}

/**
 * The tick's press: make a record's tab active, and on a phone raise the pane's full-screen layer.
 * ONE act, so a reader on a phone is not left with a tab they cannot see.
 */
export function useOpenRecord(): (citation: Citation) => void {
  const [, select] = usePaneSelection();
  const [, setLayer] = usePaneLayer();
  return (citation: Citation) => {
    select(recordTabId(citation));
    setLayer(true);
  };
}
