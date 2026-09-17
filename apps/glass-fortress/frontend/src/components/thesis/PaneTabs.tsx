'use client';

import { useTranslations } from 'next-intl';
import { DeclareTabs, usePaneLayer, usePaneSelection, type PaneTab } from '@/components/shell/RightPane';
import { domainOf, formatCaptureDate } from '@/lib/format';
import type { Citation } from '@/types/thesis';
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

function labelOf(citation: Citation, locale: string): string {
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

export function PaneTabs({ citations, pages, locale, call }: PaneTabsProps) {
  const t = useTranslations('theses.appeals');
  const tabs: PaneTab[] = citations.map((citation) => ({
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
