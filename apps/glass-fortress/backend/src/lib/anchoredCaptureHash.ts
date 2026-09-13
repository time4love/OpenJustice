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
// `contentHash` IS GONE. Identity followed the anchor at evidence step 11b
// (evidence flows A1: CAPTURE_ID composes `documentHash`), and R45-B dropped the
// column with the rest of the legacy register. VERIFIED is over `documentHash`
// alone (A3 :1043–:1044); the old registries' extraction anchors are explained by
// their committed ledgers, never by a capture row.
// ---------------------------------------------------------------------------

/**
 * THE REGISTRY CATEGORY ON EVERY CAPTURE ENTRY — the anchoring scheme.
 *
 * Evidence flows A1: one constant, one importable symbol, written on every
 * entry the walk registers and read by WRITES_ALLOWED (§8). It is what gives a
 * fresh registry one meaning from index zero — every entry is the SHA-256 of a
 * page as served — and what lets a registry refuse itself: index 0 carrying
 * anything else is a contract with another meaning, and the anchoring module
 * will not add a second one to it.
 *
 * Named beside the hash it describes on purpose. A scheme string spelled in
 * the anchoring module would be a second place to change when the rule moves,
 * and the rule and its name have to move together or the registry's own
 * category stops describing what it holds.
 */
export const ANCHOR_SCHEME = 'DOCUMENT_SHA256';

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
 * THE ONE SPELLING `anchoredHash` IS STORED IN — bare, lower-case, no `0x`.
 *
 * WHY A BRANDED TYPE. Until 2026-08-30 this column had TWO writers and TWO
 * spellings: `claimAnchor` wrote `documentHash` bare, and `forensics:confirm-anchors`
 * wrote the value ethers returns from the transaction log, which carries `0x`.
 * Both were internally consistent, so every fixture and the simulated-flip test
 * passed — and `capturesAnchoredBy` below, which compares a normalised ARGUMENT
 * against the RAW COLUMN, matched neither arm for a confirmed row. The positive
 * control found it: seven correctly anchored captures audited `STALE`, and
 * `VERIFIED` was unreachable for every snapshot that has ever existed. See
 * `docs/gf-positive-control-2026-08-30.md`.
 *
 * A comment saying "normalise before writing" would be the same control that
 * already failed. The brand makes the compiler ask: a raw `string` cannot reach
 * either write site, so a third writer cannot invent a third spelling.
 *
 * THIS IS NOT A CONTRADICTION OF `toBytes32`'s "convert at the boundary, never
 * at rest". That rule protects `Evidence.fileHash`, whose format came from a
 * different producer and is load-bearing elsewhere.
 * `anchoredHash` is not: it has no external contract, and it is used as a SQL
 * EQUALITY KEY — and SQL cannot normalise the column
 * side of a comparison. A key must have one spelling or it is not a key.
 */
export type StoredAnchorHash = string & { readonly __storedAnchorHash: unique symbol };

/** Normalise any spelling of a hash to the one `anchoredHash` is stored in. */
export function storedAnchorHash(hash: string): StoredAnchorHash {
  return hash.replace(/^0x/i, '').toLowerCase() as StoredAnchorHash;
}

/**
 * Captures whose anchored hash is this one, in either spelling.
 *
 * The prefix strip is part of the rule, not a caller's detail. `Evidence.fileHash`
 * carries `0x` and the capture columns do not, so a lookup that forgets it
 * returns zero rows — and zero rows here means `SNAPSHOT_ANCHOR` degrades to
 * `ORPHANED_ANCHOR`, reporting every correctly anchored capture as a custody
 * incident. That regression has already happened once, on 12 of production's 19
 * registrations, and a second time — via the column rather than the argument —
 * for every capture confirmed between 2026-08-30 and this fix.
 *
 * Returns a `where` fragment so callers can add their own conditions without
 * restating this one.
 */
export function capturesAnchoredBy(hash: string): Prisma.UrlSnapshotWhereInput {
  const bare = storedAnchorHash(hash);
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

/** What a recorded anchor turns out to attest to. */
export type AnchorAttestation =
  /** Attests the hash the rule names — the capture's documentHash. The only one that may read VERIFIED. */
  | 'ATTESTS_CURRENT'
  /**
   * Attests any other hash. Misanchored: the transaction is real and does not
   * attest this capture.
   *
   * There were three answers until R45-B. The middle one, ATTESTS_SUPERSEDED,
   * named an anchor over a hash the capture held under a superseded rule — the
   * Readability extraction's `contentHash` — and kept it apart from a pass,
   * because "it would stay green if the answer were a hash of the page title."
   * That column left the schema, so no capture has a second hash to be anchored
   * by, and the answer has no subject.
   */
  | 'UNRECOGNISED'
  /** No recorded anchor to classify. Not a verdict about the anchor at all. */
  | 'UNCONFIRMED';

/**
 * WHAT A RECORDED ANCHOR ATTESTS, relative to the one hash the rule names — or
 * that nothing has been recorded, which is not a verdict about the anchor at all.
 */
export function attestationOf(input: {
  anchoredHash: string | null;
  /** The hash the rule says this capture is anchored by. */
  current: string;
}): AnchorAttestation {
  if (input.anchoredHash === null) return 'UNCONFIRMED';
  // `storedAnchorHash`, not a private copy. This function had its OWN prefix
  // strip — lower-casing, where `capturesAnchoredBy`'s did not — so the module
  // built to end duplicate implementations of one rule contained two of them,
  // and they already disagreed about case. One normaliser, three callers.
  return storedAnchorHash(input.anchoredHash) === storedAnchorHash(input.current)
    ? 'ATTESTS_CURRENT'
    : 'UNRECOGNISED';
}
