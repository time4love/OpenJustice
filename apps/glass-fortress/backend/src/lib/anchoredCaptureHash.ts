import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// WHICH HASH OF A CAPTURE THE CHAIN ATTESTS TO.
//
// One rule. One importable symbol per question it answers, and nothing else in
// `src/` may name the column on an anchoring path — `test/anchoredCaptureHash.test.ts`
// reads the source and fails if it does.
//
// WHY THIS MODULE EXISTS. Before it, "the hash a capture is anchored by" was
// spelled at NINE sites: the twin lookup, the registration call, the verdict
// recorded beside it, the write path's two anchoring calls, the repair pass's
// select, the audit's subject list, `readOnChainClaim`'s snapshot count, and the
// MCP tool's capture summary. That is this repository's dominant defect shape —
// one rule, many implementations, and the copies drift. It has already reached
// five copies for evidence visibility and three for MCP tool classification, and
// the anchoring path is where a drifted copy produces FALSE CUSTODY rather than
// a wrong number.
//
// It matters most NOW because the rule is about to change. Level 3's first
// clause moves the anchor from `contentHash` to `documentHash`, and nine edits
// made by hand is nine chances to leave one behind — a site still asking the
// chain about the extraction while the rest of the system has moved to the
// document. Collapsed to one symbol, that change is one line, and no caller can
// be missed because no caller names the column.
//
// WHAT IS DELIBERATELY NOT HERE. `UrlSnapshot.contentHash` has a second,
// unrelated job: it is `SHA-256(fullText)`, the hash `rediffFromSnapshots`
// re-verifies its inputs against and `forensicEvidenceFileHash` composes
// evidence identity from. Those are claims about the EXTRACTION and are correct
// as they stand; they must not follow the anchor. Separating the two meanings is
// the point of naming this one.
//
// STILL OUTSIDE, AND KNOWN: `archiveVerification`'s `storedContentHash` reports
// a capture's hash beside `storedOnChainTxHash` in `list_captures` output, so it
// IS a display of this rule. It is left alone here because renaming it changes
// an MCP tool's output shape, which is a researcher-visible change and belongs
// with the flip rather than with a behaviour-neutral consolidation. Recorded
// here rather than remembered.
// ---------------------------------------------------------------------------

/**
 * A capture, reduced to what the anchoring rule reads.
 *
 * The type is the enumeration mechanism. When the anchor moves to
 * `documentHash` this interface changes shape, and every caller that builds one
 * by hand stops compiling — the same move Level 1 used to find its callers, and
 * for the same reason: a compiler's list is complete and a grep's is not.
 */
export interface AnchorableCapture {
  contentHash: string;
}

/**
 * The columns a query must select for its rows to be anchorable.
 *
 * Spread into a Prisma `select` rather than copied. A caller that lists the
 * column itself is a caller the flip will not reach.
 */
export const ANCHORABLE_CAPTURE_SELECT = {
  contentHash: true,
} satisfies Prisma.UrlSnapshotSelect;

/**
 * The hash this capture's on-chain registration is about.
 *
 * BARE HEX, as stored. Call `toBytes32` at the chain boundary — passing the bare
 * form where bytes32 was required is what made 83 snapshot anchorings silently
 * no-op, and normalising at rest here would only move that mistake somewhere the
 * stored formats still disagree.
 */
export function anchoredCaptureHash(capture: AnchorableCapture): string {
  return capture.contentHash;
}

/**
 * Captures whose anchored hash is this one, in either spelling.
 *
 * The prefix strip is part of the rule, not a caller's detail. `Evidence.fileHash`
 * carries `0x` and the capture columns do not, so a lookup that forgets it
 * returns zero rows — and zero rows here means `SNAPSHOT_ANCHOR` degrades to
 * `ORPHANED_ANCHOR`, reporting every correctly anchored capture as a custody
 * incident. That regression has already happened once, on 12 of production's 19
 * registrations.
 *
 * Returns a `where` fragment so callers can add their own conditions without
 * restating this one.
 */
export function capturesAnchoredBy(hash: string): Prisma.UrlSnapshotWhereInput {
  const bare = hash.replace(/^0x/, '');
  // RECORDED FIRST, RULE ONLY AS A FALLBACK.
  //
  // A confirmed row says what its transaction registered, and that answer is
  // true whatever rule wrote it — which is what keeps a capture anchored under a
  // superseded rule resolving as SNAPSHOT_ANCHOR instead of ORPHANED_ANCHOR once
  // Level 3 moves the anchor. The second arm covers a capture that is not
  // anchored yet, or not yet confirmed: there is no recorded answer, so the
  // question can only be asked of the rule.
  return { OR: [{ anchoredHash: bare }, { anchoredHash: null, contentHash: bare }] };
}

/** A row that may already state what its anchoring transaction registered. */
export interface AnchorClaimRow {
  anchoredHash: string | null;
}

/**
 * WHICH HASH A STORED ANCHORING CLAIM SHOULD BE AUDITED AGAINST.
 *
 * `confirmed` is returned rather than folded away because the two cases are
 * different KINDS of answer and an audit that cannot tell them apart is the
 * failure this whole column exists to end. A confirmed hash is an observation of
 * the transaction itself. An unconfirmed one is our current rule's expectation —
 * true today only because the rule has not moved yet, and it stops being true
 * the moment it does.
 *
 * That is precisely why `forensics:confirm-anchors` must run to completion in an
 * environment BEFORE the anchor moves there. Until it has, this falls back to
 * the rule, and a rule that has changed under a legacy row would audit it
 * against a hash nothing registered.
 */
export function hashUnderAudit(
  row: AnchorClaimRow,
  expected: string,
): { hash: string; confirmed: boolean } {
  return row.anchoredHash === null
    ? { hash: expected, confirmed: false }
    : { hash: row.anchoredHash, confirmed: true };
}
