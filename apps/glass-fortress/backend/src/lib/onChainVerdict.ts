import { createHash } from 'crypto';

/**
 * LEVEL 3'S INVARIANT, as one rule.
 *
 * *The on-chain record attests to the document, and the database's claim about
 * it is CHECKED rather than asserted.*
 *
 * This module holds the second half of that sentence: given what the database
 * claims and what the contract holds, which of them is true, and is that a
 * verdict anyone may rely on.
 *
 * PURE. No prisma, no ethers, no network — a function of two observations
 * already made. `onChainVerification.ts` makes the observations and stores the
 * verdict; this file decides what the verdict IS, so the decision can be tested
 * against every combination without mocking a chain.
 *
 * WHY IT MOVED HERE. The decision lived inside `mcp/tools/checkOnChainStatus.ts`
 * and was reachable only by a human calling an MCP tool. §3 of the rebuild plan
 * is explicit that a check nobody runs has not been performed, so the write path
 * needed the same decision — and copying it would have been one rule with two
 * implementations, this repository's dominant defect shape, in the one place
 * where the two copies would be two definitions of what "anchored" means.
 */

/**
 * WHICH RULE PRODUCED A VERDICT.
 *
 * The same discipline `SURVIVAL_CHECK_VERSION` earned the hard way one level up:
 * a stored verdict whose RULE has moved is wrong while every hash still matches
 * and every count stays green. `sourceStateHash` commits to the check's INPUTS
 * and is structurally blind to the rule that read them.
 *
 * BUMP THIS whenever `decideOnChainVerdict` can return a different verdict, or
 * `CONSISTENT_VERDICTS` a different answer, for unchanged inputs. Stored checks
 * at an older version are then reported stale rather than believed.
 */
export const ON_CHAIN_CHECK_VERSION = 'v1-decide-verdict-positive-consistency';

/**
 * Verdicts are named for the operator decision they imply, not for the field
 * values that produced them.
 */
export const ON_CHAIN_VERDICTS = {
  /** DB CONFIRMED, chain registered, tx hash recorded. Nothing to do. */
  CONSISTENT: 'CONSISTENT',
  /**
   * DB says CONFIRMED but the contract has never seen this hash. The record
   * asserts an anchor that does not exist. This is the fake-CONFIRMED class.
   */
  UNANCHORED_CONFIRMED: 'UNANCHORED_CONFIRMED',
  /**
   * Chain agrees the hash is registered, but the row records no tx hash, so
   * the anchor cannot be cited. Recoverable — pass recoverTxHash: true.
   */
  MISSING_TX_HASH: 'MISSING_TX_HASH',
  /** PENDING_REVIEW and unregistered. The normal pre-promotion state. */
  PENDING_UNREGISTERED: 'PENDING_UNREGISTERED',
  /**
   * PENDING_REVIEW, but the contract already holds this hash. Either a prior
   * promotion half-completed, or the hash collides with an orphaned anchor.
   * Promoting will revert as a duplicate — investigate before promoting.
   */
  PENDING_BUT_ANCHORED: 'PENDING_BUT_ANCHORED',
  /** No Evidence row and no registration. Nothing anywhere — nothing to reconcile. */
  NOT_IN_VAULT: 'NOT_IN_VAULT',
  /**
   * Registered on-chain with no Evidence row behind it. An anchor asserting a
   * record nobody can produce — the condition the 2026-08-20 audit found twice
   * and the reason this check exists. Never report it as consistent.
   */
  ORPHANED_ANCHOR: 'ORPHANED_ANCHOR',
  /**
   * Registered on-chain, no Evidence row — and a UrlSnapshot holds this text.
   * Not an orphan: an archived capture, anchored exactly as the scanner is
   * meant to anchor it.
   *
   * Added 2026-08-25 after a tutorial run asked this tool about a snapshot hash
   * and was told to "investigate before registering anything else against this
   * hash". The verdict branched on `inVault`, which means an Evidence row and
   * nothing else, so every correctly-anchored capture reported as a data
   * integrity incident — 12 of production's 19 registrations, all of them
   * working as designed.
   *
   * The seventh instance of mechanism right, summary wrong. FINDING 95 already
   * wrote the argument against exactly this: a false alarm invites either a
   * repair that is not needed, or doubt about evidence whose custody is in fact
   * complete. The researcher who hit it did the second.
   */
  SNAPSHOT_ANCHOR: 'SNAPSHOT_ANCHOR',
  /**
   * A CAPTURE WHOSE TEXT IS NOT REGISTERED. The database holds captures for
   * this hash and the contract does not hold the hash.
   *
   * Reached only from the write path. The MCP tool never produced it because
   * `decideVerdict` answered NOT_IN_VAULT for anything without an Evidence row
   * — "there is nothing to reconcile" — which is true of a hash nobody ever
   * meant to anchor and false of one the anchoring path just tried to write.
   * Against 83 snapshots that sat unanchored for months while a count of
   * unanchored rows read zero, collapsing those two into one reassuring verdict
   * is the failure this level exists to end.
   */
  SNAPSHOT_UNANCHORED: 'SNAPSHOT_UNANCHORED',
} as const;

export type OnChainVerdict = (typeof ON_CHAIN_VERDICTS)[keyof typeof ON_CHAIN_VERDICTS];

/**
 * Verdicts in which the database and the contract actually agree.
 *
 * Deliberately a positive list. This was written as a negative filter — every
 * verdict except a few named ones counted as consistent — and NOT_IN_VAULT
 * therefore reported `consistent: true` even when the chain held the hash,
 * which is precisely an orphaned anchor. A positive list fails the safe way:
 * a verdict added later is inconsistent until someone says otherwise.
 */
export const CONSISTENT_VERDICTS: ReadonlySet<OnChainVerdict> = new Set([
  ON_CHAIN_VERDICTS.CONSISTENT,
  ON_CHAIN_VERDICTS.PENDING_UNREGISTERED,
  ON_CHAIN_VERDICTS.NOT_IN_VAULT,
  // The database and the chain agree completely: the capture exists, its text is
  // registered. Reporting `consistent: false` here is what sent a researcher
  // looking for a custody problem that did not exist.
  ON_CHAIN_VERDICTS.SNAPSHOT_ANCHOR,
]);

export const ON_CHAIN_EXPLANATIONS: Record<OnChainVerdict, string> = {
  CONSISTENT:
    'The database and the contract agree, and the anchoring transaction is recorded. This record can be cited as on-chain evidence.',
  UNANCHORED_CONFIRMED:
    'The record claims CONFIRMED but the contract has no registration for this hash. The evidentiary claim is unsupported — treat the record as unverified until it is registered.',
  MISSING_TX_HASH:
    'The hash is registered on-chain but the row does not record which transaction did it, so the anchor cannot be cited. Re-run with recoverTxHash: true.',
  PENDING_UNREGISTERED:
    'Awaiting review, not yet anchored. This is the expected state before promotion.',
  PENDING_BUT_ANCHORED:
    'The contract already holds this hash while the row is still PENDING_REVIEW. Promotion would revert as a duplicate. Investigate the existing anchor before promoting.',
  NOT_IN_VAULT:
    'No evidence record exists for this hash, and the registry does not hold it either. There is nothing to reconcile.',
  ORPHANED_ANCHOR:
    'The registry holds this hash but no evidence record exists for it. Something anchored a record that cannot now be produced — investigate before registering anything else against this hash.',
  SNAPSHOT_ANCHOR:
    'This is an archived capture, not an evidence record, and its text is registered on-chain exactly as intended. Nothing is wrong and nothing needs repairing. A capture is anchored by its TEXT, so several captures of an unchanged page share one registration and one transaction; `snapshot.onChainTxHash` is the transaction that anchors this text, whichever capture spent it. To see the evidence records derived from this page, use get_scan_findings or search_evidence.',
  SNAPSHOT_UNANCHORED:
    'Captures holding this text exist, but the registry does not hold their hash — the chain of custody for these captures is incomplete. Re-run forensics:anchor-snapshots for this page.',
};

/**
 * The database's claim, as the rule sees it.
 *
 * `snapshots` is a COUNT rather than a boolean because the count is what
 * distinguishes "this hash belongs to captures" from "this hash belongs to
 * nothing", and a caller that has the rows has the count for free.
 */
export interface OnChainClaim {
  inVault: boolean;
  status: string | null;
  txHash: string | null;
  snapshots: number;
}

export function decideOnChainVerdict(claim: OnChainClaim, registered: boolean): OnChainVerdict {
  if (!claim.inVault) {
    // An anchored capture is not an orphan. Checked before the orphan branch
    // because "no Evidence row" is true of every snapshot in the system, and
    // reading that as an integrity failure is what made this check alarm on 12
    // of production's 19 registrations.
    if (claim.snapshots > 0) {
      return registered
        ? ON_CHAIN_VERDICTS.SNAPSHOT_ANCHOR
        : ON_CHAIN_VERDICTS.SNAPSHOT_UNANCHORED;
    }
    return registered ? ON_CHAIN_VERDICTS.ORPHANED_ANCHOR : ON_CHAIN_VERDICTS.NOT_IN_VAULT;
  }

  if (claim.status === 'CONFIRMED') {
    if (!registered) return ON_CHAIN_VERDICTS.UNANCHORED_CONFIRMED;
    return claim.txHash ? ON_CHAIN_VERDICTS.CONSISTENT : ON_CHAIN_VERDICTS.MISSING_TX_HASH;
  }

  return registered
    ? ON_CHAIN_VERDICTS.PENDING_BUT_ANCHORED
    : ON_CHAIN_VERDICTS.PENDING_UNREGISTERED;
}

/**
 * WHAT THE VERDICT WAS COMPUTED AGAINST — the LOCAL half, and only that.
 *
 * §3's `sourceStateHash` discipline: staleness becomes COMPUTABLE rather than
 * assumed. A stored verdict is stale the moment the database claim it judged has
 * moved — a record promoted, a transaction hash filled in, a capture added — and
 * without this the row would keep reporting a verdict about a claim nobody makes
 * any more.
 *
 * THE CHAIN SIDE IS DELIBERATELY ABSENT, and that is the whole point of §3's
 * middle row: an observation of an external system cannot be re-derived, so it
 * is STORED rather than hashed. Folding `registered` in here would produce a
 * hash that agrees with itself forever — recomputing it would re-read the chain,
 * so the check could never be found stale by the only axis it cannot see. What
 * this hash answers is the answerable question: *has our own claim changed since
 * we asked?*
 *
 * Every component is fixed-length hex or a decimal count before joining, so no
 * value can contain the separator and shift the framing.
 */
export function onChainSourceStateHash(input: { fileHash: string; claim: OnChainClaim }): string {
  const sha = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
  const parts = [
    sha(input.fileHash),
    input.claim.inVault ? '1' : '0',
    sha(input.claim.status ?? ''),
    sha(input.claim.txHash ?? ''),
    String(input.claim.snapshots),
  ];
  return sha(parts.join('|'));
}
