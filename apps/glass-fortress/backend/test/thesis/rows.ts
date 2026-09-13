import type { Row } from '../helpers/evidenceDouble';
import type { DebateRef, ThesisMentionRow } from './contract';
import { THESIS } from './fixtures';

// ---------------------------------------------------------------------------
// A MENTION ROW AS THE SHARED DOUBLE'S DELEGATES READ IT — one spelling for every
// thesis file. Written in `derivations.test.ts` at 7.2 and moved here at 7.3, when
// the tool files needed the same row: two copies would be two answers to "what
// does the double hold for a mention", free to drift.
//
// The row carries A2's columns (`versionId`, `kind`, `name`) — single-keyed since
// thesis step 18 renamed them; the built names it carried beside them until then
// left with the rename — and the relations `publishable` and `flagged` select: the
// version's thesis and publication pin, and the debate. The double answers a row
// WHOLE, whatever the `select`, so the relations must be on it.
// ---------------------------------------------------------------------------

/**
 * `thesisId` names the thesis the mention's VERSION belongs to — THESIS unless a case
 * seeds a second thesis, as `list_thesis_reviews`' ordering case does (7.3).
 */
export const mentionRow = (
  mention: ThesisMentionRow,
  published: boolean,
  debate: (DebateRef & { id: string }) | null = null,
  thesisId = THESIS.id,
): Row => ({
  ...mention,
  debateSessionId: debate?.id ?? mention.debateSessionId,
  thesisVersion: { thesisId, isPublished: published ? { id: thesisId } : null },
  // The three fields evidence's `argued` reads (evidencePredicates.ts :191–:197),
  // under the relation `publishable` selects them through (7.2 round 3, M1).
  debateSession:
    debate === null ? null : { status: debate.status, recordFileHash: debate.recordFileHash, thesisId: debate.thesisId },
});
