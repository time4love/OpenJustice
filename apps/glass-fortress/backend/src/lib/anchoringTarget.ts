import { EXPECTED_CHAIN_ID } from './chainIdentity';
import { getAppEnv } from './appEnv';

// ---------------------------------------------------------------------------
// WHICH REGISTRY A CURRENT VERDICT MUST HAVE BEEN REACHED AGAINST.
//
// The other half of `IntegrityCheck.chainId` / `registryAddress`. Stamping which
// chain a verdict came off is worth nothing on its own — the 91 wrong rows would
// have carried a stamp and still counted as VERIFIED. Something has to READ the
// stamp and refuse the ones that do not name this deployment's registry, and
// this is the rule it reads by.
//
// CONFIGURATION ONLY, NO RPC. `auditOnChainAnchors` derives every state from
// stored rows and never touches the chain, which is what makes it cheap,
// deterministic and safe to point anywhere. Asking an RPC "which chain am I on?"
// in order to judge stored rows would trade that away for nothing: the answer is
// already pinned per environment, and `assertOperationalContext` has confirmed
// the pin against the live RPC before any script gets this far.
//
// BOTH FIELDS, because neither is sufficient alone. Two registries can be
// deployed to one chain, and one address exists on every chain — the address
// that started this whole rule was a Hardhat first-deployment address, correctly
// formed, with no code on Base at all.
// ---------------------------------------------------------------------------

/** The chain and contract this deployment's verdicts are about. */
export interface AnchoringTarget {
  chainId: number;
  /**
   * Null when EVIDENCE_REGISTRY_ADDRESS is unset. Then no stored verdict can be
   * shown to describe this deployment, and every one of them reads as no current
   * answer — loudly, and in the safe direction. A deployment that cannot say
   * which registry it anchors to has no business confirming that anything is
   * anchored.
   */
  registryAddress: string | null;
}

export function anchoringTarget(env: NodeJS.ProcessEnv = process.env): AnchoringTarget {
  const raw = env.EVIDENCE_REGISTRY_ADDRESS;
  return {
    chainId: EXPECTED_CHAIN_ID[getAppEnv(env)],
    registryAddress: raw === undefined || raw === '' ? null : normaliseAddress(raw),
  };
}

/**
 * Lower-cased, so a checksummed address and its lower-case spelling of the same
 * contract are one value. EIP-55 casing is a checksum over the same 20 bytes,
 * not a different address, and comparing the two as strings would report a
 * verdict about this very registry as a verdict about somewhere else.
 */
export function normaliseAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Does a stored check describe THIS deployment's registry?
 *
 * Returns the reason it does not, so the audit can print what is wrong rather
 * than a bare state — for a provenance failure the detail is the deliverable,
 * exactly as it is for a contradiction.
 */
export function chainProvenanceGap(
  check: { chainId: number | null; registryAddress: string | null },
  target: AnchoringTarget = anchoringTarget(),
): string | null {
  // NULL IS NOT A PASS, and it is the state the 91 rows are in. A verdict that
  // does not record which chain it asked is not a verdict about this chain; it
  // is a verdict whose subject is unknown, and the audit may not read an unknown
  // subject as agreement. Kept rather than deleted: these rows are the evidence
  // that the pipeline was wrong.
  if (check.chainId === null || check.registryAddress === null) {
    return (
      'this verdict does not record which chain and registry it was reached against, so ' +
      'nothing shows it is about this deployment'
    );
  }
  if (target.registryAddress === null) {
    return (
      'EVIDENCE_REGISTRY_ADDRESS is not set on this deployment, so no stored verdict can be ' +
      'shown to describe it'
    );
  }
  if (check.chainId !== target.chainId) {
    return (
      `this verdict was reached against chain ${String(check.chainId)}, but this deployment ` +
      `anchors to ${String(target.chainId)}`
    );
  }
  if (normaliseAddress(check.registryAddress) !== target.registryAddress) {
    return (
      `this verdict was reached against registry ${check.registryAddress}, but this deployment ` +
      `anchors to ${target.registryAddress}`
    );
  }
  return null;
}
