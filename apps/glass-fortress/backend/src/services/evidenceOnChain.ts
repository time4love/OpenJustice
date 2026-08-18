import { ethers } from 'ethers';
import { Web3Service, DuplicateEvidenceError } from './Web3Service';
import { onChainCategoryLabel, type InvestigativeCategory } from '../lib/investigativeCategories';

// ---------------------------------------------------------------------------
// Shared on-chain registration for every "promote an existing record to
// CONFIRMED" path (promoteEvidence.ts, forensicsRoutes.ts /promote,
// WaybackScraper.ts autoPromoteToEvidence). These three share identical
// semantics: register the hash, and treat "already registered" as success,
// not failure — the record being promoted twice, or raced by two workers,
// should complete normally.
//
// Deliberately NOT used by evidenceRoutes.ts /confirm (fresh submissions):
// there, a duplicate hash means a second, independent submission of the same
// content and is correctly rejected (409) rather than silently accepted — a
// different domain meaning for the same underlying contract error, not a bug
// to unify away. See docs/gf-evidence-integrity-dev-plan.md §4.
// ---------------------------------------------------------------------------

// Discriminated union, not two independent fields: `txHash` MUST be a real,
// verifiable transaction hash whenever `confirmed` is true, and MUST be null
// otherwise — CONFIRMED must always be able to point at its own proof, never
// borrow it from "we're pretty sure this is fine." Modeling it this way means
// a caller that checks `if (!registration.confirmed) return` gets
// `registration.txHash` narrowed to `string`, not `string | null` — the
// invariant is enforced by the type checker, not just documented.
export type OnChainRegistration =
  | { confirmed: true; txHash: string }
  | { confirmed: false; txHash: null };

/**
 * Registers `fileHash` on-chain. Skips (returns `{confirmed: false, txHash:
 * null}`) if `web3` is null — the caller decides whether an unconfigured
 * chain is fatal (fail-loud HTTP routes should still error before this is
 * ever called with null, since their `getWeb3Service()` throws instead of
 * returning null) or an acceptable soft-fallback (fire-and-forget background
 * jobs, which pass their nullable `getWeb3Service()` through directly).
 *
 * Any registration failure other than "already registered" propagates to the
 * caller — this function does not decide fail-loud vs. fall-back-to-pending,
 * every caller already has its own policy for that.
 */
export async function registerEvidenceOnChain(
  web3: Web3Service | null,
  fileHash: string,
  categories: readonly InvestigativeCategory[],
  evidenceRole: string,
): Promise<OnChainRegistration> {
  if (!web3) return { confirmed: false, txHash: null };

  try {
    const txHash = await web3.registerEvidenceHash(
      fileHash,
      ethers.ZeroAddress,
      onChainCategoryLabel(categories, evidenceRole),
    );
    return { confirmed: true, txHash };
  } catch (err) {
    if (err instanceof DuplicateEvidenceError) {
      // The revert means OUR call never produced a transaction — recover the
      // real one that originally registered this hash, rather than accepting
      // "it's on-chain somewhere, trust us." If that recovery itself comes up
      // empty (should not normally happen for a hash the contract just
      // confirmed exists), this is NOT confirmed — a record must never be
      // marked CONFIRMED without a transaction hash it can actually point to.
      const txHash = await web3.findRegisteringTxHash(fileHash);
      return txHash ? { confirmed: true, txHash } : { confirmed: false, txHash: null };
    }
    throw err;
  }
}
