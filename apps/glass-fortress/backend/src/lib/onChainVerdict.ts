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
 *
 * MOVED v1 → v2 AT EVIDENCE STEP 12, and the reason is what the check now ASKS.
 * The v1 check asked whether the registry holds a hash; it never asked WHO
 * submitted it, so a verdict written under it cannot answer ATTRIBUTED —
 * `isRegistered(hash) AND getEvidence(index).submitter = our registrar` (A3, §8)
 * — which is the conjunct VERIFIED(e) rests on. A row at v1 is therefore not
 * "attributed: false"; it is a row that never asked, and every read that reports
 * attribution from a stored verdict reads an older version as `null` for exactly
 * that reason. Captures anchored before this moved are re-checked by a
 * maintenance pass in the deployment, on the researcher's instruction.
 */
export const ON_CHAIN_CHECK_VERSION = 'v2-attribution-from-chain-state';

/**
 * Verdicts are named for the operator decision they imply, not for the field
 * values that produced them.
 */
// FIVE VERDICTS LEFT THIS MAP AT EVIDENCE STEP 11b, AND THE REACHABILITY GUARD
// IS WHY THEY COULD NOT SIMPLY BE LEFT.
//
// CONSISTENT, UNANCHORED_CONFIRMED, MISSING_TX_HASH, PENDING_UNREGISTERED and
// PENDING_BUT_ANCHORED were all about an EVIDENCE ROW'S OWN REGISTRATION —
// whether a CONFIRMED row's anchor existed, whether its transaction was
// recorded, what a pending row's registration meant. Nothing above the corpus is
// anchored (evidence flows §5), the two statuses are PROMOTED and WITHDRAWN, and
// the transaction column is gone: not one of the five can be produced.
//
// `every verdict the rule can name is reachable and explained` is the case that
// forced the choice, and it names the failure mode exactly — "a verdict that
// exists, is never produced, and is therefore never questioned". Leaving them
// would have meant weakening that guard to accommodate dead vocabulary, which is
// the assertion-weakened-to-pass this repository does not do.
//
// NOTHING STORED IS ORPHANED BY THE REMOVAL: the database was rebuilt at refactor
// step 9 and holds no integrity check row carrying one of these strings.
export const ON_CHAIN_VERDICTS = {
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
  ON_CHAIN_VERDICTS.NOT_IN_VAULT,
  // The database and the chain agree completely: the capture exists, its text is
  // registered. Reporting `consistent: false` here is what sent a researcher
  // looking for a custody problem that did not exist.
  ON_CHAIN_VERDICTS.SNAPSHOT_ANCHOR,
]);

export const ON_CHAIN_EXPLANATIONS: Record<OnChainVerdict, string> = {
  // SAYS WHAT IT CHECKED, NOT WHAT THE CALLER MAY CONCLUDE. This asserted
  // "This record can be cited as on-chain evidence" until 2026-08-30, when it
  // said exactly that about a record the anchor audit calls UNATTRIBUTED and
  // `confirm-anchors` calls TX_UNREADABLE — during the session that had just
  // published a thesis citing it. The verdict was right; the sentence claimed
  // a second thing the verdict never asked.
  NOT_IN_VAULT:
    'No evidence record exists for this hash, and the registry does not hold it either. There is nothing to reconcile.',
  ORPHANED_ANCHOR:
    'The registry holds this hash but no evidence record exists for it. Something anchored a record that cannot now be produced — investigate before registering anything else against this hash.',
  SNAPSHOT_ANCHOR:
    'This is an archived capture, not an evidence record, and its bytes are registered on-chain exactly as intended: the anchor is the SHA-256 of the page as served (documentHash), under the category DOCUMENT_SHA256, written by the walk as the capture was stored. Nothing is wrong and nothing needs repairing. `snapshot.onChainTxHash` is the transaction that registered it and `anchoredHash` is what it registered. To see the page as the corpus holds it, use list_captures.',
  SNAPSHOT_UNANCHORED:
    'A capture holds these bytes, but the registry does not hold their hash — its anchor is owed. The walk retries the anchor on the next scan_captures call, through the store’s existing-row path; nothing else writes it.',
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

  // THE CONFIRMED BRANCH WENT AT EVIDENCE STEP 11b, WITH THE COLUMNS IT READ.
  //
  // It asked whether a CONFIRMED evidence row's registration was consistent with
  // the chain, and returned CONSISTENT or MISSING_TX_HASH from `txHash`. There is
  // no CONFIRMED status and no transaction column: nothing above the corpus is
  // anchored (evidence §5), so an evidence row has no registration to be
  // consistent with. An evidence row that a registry nonetheless holds a hash for
  // is an ORPHANED_ANCHOR — a real custody question, and the honest one.
  //
  // The verdicts themselves stay in the enum with their explanations: legacy
  // check rows carry them, and `check_on_chain_status` is rebuilt at step 12
  // re-scoped to CAPTURES, which is where the remaining ones belong.
  return registered ? ON_CHAIN_VERDICTS.ORPHANED_ANCHOR : ON_CHAIN_VERDICTS.NOT_IN_VAULT;
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
    String(input.claim.snapshots),
  ];
  return sha(parts.join('|'));
}
