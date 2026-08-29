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
// LEVEL 3 CLAUSE 1 MOVED THE RULE HERE, 2026-08-30, and this module is why that
// was one line rather than nine edits with nine chances to leave one behind.
// The anchor now attests to `documentHash` — the payload as served — rather than
// to `contentHash`, which is SHA-256 of Readability's article and discards ~31%
// of the page, hrefs among it. This platform's central finding is that a
// reporting-channel LINK was removed, so the one layer the old anchor could not
// speak for was the layer the thesis turns on.
//
// Measured on staging, 105 captures: `contentHash` collapses to 15 distinct
// values and `documentHash` to 104. The old anchor distinguished 15 states of a
// page that had 104, and one hash covered 25 distinct documents. Twins are
// therefore near-extinct now and anchoring costs roughly one transaction per
// capture — measured at 144,875 gas, about 0.00009 ETH for the whole corpus at
// Base mainnet's 0.006 gwei. That price was accepted deliberately: per-capture
// truth costs per-capture anchoring, and the twin collapse was never a saving,
// it was the defect restated as one.
//
// `contentHash` KEEPS ITS OTHER JOBS. It is still what `rediffFromSnapshots`
// re-verifies its inputs against and what `forensicEvidenceFileHash` composes
// evidence identity from. Whether identity follows the anchor is §2's decision
// and the researcher's, not this module's.
//
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
  documentHash: string;
}

/**
 * The columns a query must select for its rows to be anchorable.
 *
 * Spread into a Prisma `select` rather than copied. A caller that lists the
 * column itself is a caller the flip will not reach.
 */
export const ANCHORABLE_CAPTURE_SELECT = {
  documentHash: true,
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
  return capture.documentHash;
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
  return { OR: [{ anchoredHash: bare }, { anchoredHash: null, documentHash: bare }] };
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

/**
 * Every hash a capture is known by, whichever one the anchoring rule currently
 * names. Declared independently of `AnchorableCapture` rather than extending it,
 * so moving the rule cannot silently shrink the set an anchor is checked against.
 */
export interface CaptureHashes {
  contentHash: string;
  documentHash: string;
}

/** The columns needed to say whether an anchor attests to something this capture IS. */
export const CAPTURE_HASHES_SELECT = {
  contentHash: true,
  documentHash: true,
} satisfies Prisma.UrlSnapshotSelect;

/** Every hash this capture is known by. Order carries no meaning. */
export function capturesKnownHashes(capture: CaptureHashes): string[] {
  return [capture.contentHash, capture.documentHash];
}

/** What a recorded anchor turns out to attest to. */
export type AnchorAttestation =
  /** Attests the hash the CURRENT rule names. The only one that may read VERIFIED. */
  | 'ATTESTS_CURRENT'
  /**
   * Attests a hash this subject really has, but not the one the current rule
   * names — an anchor made under a superseded rule.
   *
   * EXPLAINABLE IS NOT PASSING, and keeping those apart is the whole point of
   * this classification. After Level 3 moves the anchor to the document, all 105
   * legacy captures land here: they attest the Readability extraction. If that
   * read VERIFIED, the audit would go green on a corpus where clause 1 is false
   * for every single row, and the flip would "close" Level 3 with nothing changed
   * on chain — which is precisely what the plan warns against: "it would stay
   * green if the answer were a hash of the page title."
   *
   * Superseding these is Level 10's business. Until then they are visible and
   * non-passing.
   */
  | 'ATTESTS_SUPERSEDED'
  /** Attests a hash this subject does not have by any rule. Misanchored. */
  | 'UNRECOGNISED'
  /** No recorded anchor to classify. Not a verdict about the anchor at all. */
  | 'UNCONFIRMED';

/**
 * THREE WAYS AN ANCHOR CAN RELATE TO ITS SUBJECT, not two.
 *
 * A two-way split — matches one of the subject's hashes, or matches none —
 * collapses "attests a superseded rule" into "attests correctly", which is the
 * failure above. The middle case is the one that matters, because after the flip
 * it is the case every legacy row is in.
 */
export function attestationOf(input: {
  anchoredHash: string | null;
  /** The hash the current rule says this subject should be anchored by. */
  current: string;
  /** Every hash the subject is known by, the current one included. */
  known: readonly string[];
}): AnchorAttestation {
  if (input.anchoredHash === null) return 'UNCONFIRMED';
  const bare = (h: string): string => h.replace(/^0x/, '').toLowerCase();
  const anchored = bare(input.anchoredHash);
  if (anchored === bare(input.current)) return 'ATTESTS_CURRENT';
  return input.known.some((h) => bare(h) === anchored) ? 'ATTESTS_SUPERSEDED' : 'UNRECOGNISED';
}
