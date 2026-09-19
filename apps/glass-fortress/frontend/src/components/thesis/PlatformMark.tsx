import { useTranslations } from 'next-intl';

/** Every mark the platform may put beside what it judges — the body's fields, never a verdict the page computed. */
export type MarkKind =
  | 'verified'
  | 'flagged'
  | 'argued'
  | 'overObjection'
  | 'analysisRun'
  | 'publishedOverObjection'
  | 'trajectoryCurrent'
  | 'trajectoryStale'
  | 'trajectoryUnresolved';

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
