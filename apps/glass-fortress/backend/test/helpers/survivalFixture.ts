/**
 * The Level 5 columns and capture relations every diff row now carries.
 *
 * WHY A SHARED FIXTURE. Six test suites build their own diff rows by hand, and
 * when the surfaces began rendering a verdict, every one of them broke — not
 * because the code was wrong, but because each fixture was a smaller row than
 * the query returns. Patching six copies is how they drift; the next column
 * added to this level should be one edit here.
 *
 * DEFAULTS TO UNCHECKED, deliberately. A fixture that defaulted to SURVIVES
 * would make every unrelated test assert against a passing verdict it never
 * meant to set, and the first test to genuinely need UNCHECKED would be the one
 * that looked unusual. Unchecked is what an untouched row actually is.
 */
export const TEXT_VERSION = 'v2-inflate-decode-htmltotext-normalised';

export function survivalFixture(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    beforeSnapshot: { textHash: 'a'.repeat(64), textExtractionVersion: TEXT_VERSION },
    afterSnapshot: { textHash: 'b'.repeat(64), textExtractionVersion: TEXT_VERSION },
    survivalVerdict: null,
    survivalSourceStateHash: null,
    survivalTextVersion: null,
    // NULL is a verdict from a rule older than any named one. The audit reads it
    // as STALE, on the same reasoning that makes a NULL verdict UNCHECKED.
    survivalCheckVersion: null,
    survivalCheckedAt: null,
    survivalChunksChecked: null,
    survivalContradicted: [],
    rawDeletedText: '[]',
    rawAddedText: '[]',
    ...over,
  };
}
