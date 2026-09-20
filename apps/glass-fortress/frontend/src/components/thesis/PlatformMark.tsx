import { useTranslations } from 'next-intl';

/**
 * Every mark the platform may put beside what it judges — the body's fields, never a verdict the page computed.
 *
 * NINE → FOURTEEN, RULED 2026-09-20 (the researcher's freeze, "2 marks"; plan :771, ui §21 :626's one-mark
 * rule). `notPublic` is the read view's mark on a page no published thesis has opened (§27 :866), and the four
 * verdict words are the PLATFORM's own on a closed debate and a publication attempt — which is the same
 * sentence §21 :626 already ruled for NOT PUBLIC, read on them. A second mark component for either would be
 * the second spelling that clause exists to prevent.
 */
export type MarkKind =
  | 'verified'
  | 'flagged'
  | 'argued'
  | 'overObjection'
  | 'analysisRun'
  | 'publishedOverObjection'
  | 'trajectoryCurrent'
  | 'trajectoryStale'
  | 'trajectoryUnresolved'
  | 'notPublic'
  | 'promoted'
  | 'abandoned'
  | 'refused'
  | 'published';

/**
 * THE PLATFORM'S VOICE — docs/gf-ui-flows.md §16 :517–:521, §21 :626–:627. A mark beside the thing it judges,
 * from a FIELD OF THE BODY (VERIFIED, FLAGGED, argued, over objection). The page re-derives none of them: a mark
 * computed here would be the second spelling §21 forbids.
 */
export function PlatformMark({ kind }: { kind: MarkKind }) {
  const t = useTranslations('theses.marks');
  return (
    <span data-mark={kind} className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
      {t(kind)}
    </span>
  );
}
