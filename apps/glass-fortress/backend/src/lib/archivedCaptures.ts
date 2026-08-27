import { CaptureProvenance } from '@prisma/client';

/**
 * Scoping a query to captures the Internet Archive holds.
 *
 * `waybackTimestamp` became nullable in
 * 20260827160000_capture_provenance_and_captured_at, because a capture no longer
 * has to be archived. Several services were written when it did, and read the
 * Archive timestamp as though every capture must have one.
 *
 * Those services are not all wrong to want that. Some are genuinely
 * archive-scoped — cross-checking the CDX index, for instance, can only mean
 * anything for captures CDX could hold. For those, restricting the query is the
 * correct fix and not merely the one that satisfies the compiler.
 *
 * WHAT THIS IS NOT: a general adapter for making nullable timestamps go away.
 * Every use is a statement that the operation is meaningless for a non-archived
 * capture. Where that is untrue — anything ordering, diffing or displaying a
 * timeline — the fix is `capturedAt`, which exists so that a corpus mixing
 * provenances still has one chronology.
 *
 * Grep this symbol to find every place Level 2 must revisit once direct captures
 * exist. See docs/gf-factual-layer-rebuild-dev-plan.md Levels 1 and 2.
 */
export const ARCHIVED_CAPTURES_ONLY = {
  provenance: CaptureProvenance.WAYBACK,
  waybackTimestamp: { not: null },
} as const;

/**
 * Narrow a row already restricted by ARCHIVED_CAPTURES_ONLY.
 *
 * Throws rather than dropping. A null here means the QUERY failed to apply the
 * restriction, not that the data is unusual — and silently dropping the row
 * would shrink a comparison set, which in this codebase is how a bug becomes a
 * missing capture and then a finding about the Archive.
 */
export function requireArchived<T extends { waybackTimestamp: string | null }>(
  row: T,
  context: string,
): T & { waybackTimestamp: string } {
  if (row.waybackTimestamp === null) {
    throw new Error(
      `${context}: expected an archived capture, but waybackTimestamp is null. ` +
        'The query is missing ARCHIVED_CAPTURES_ONLY.',
    );
  }
  return { ...row, waybackTimestamp: row.waybackTimestamp };
}
