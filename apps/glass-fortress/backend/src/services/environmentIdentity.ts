import { prisma } from '../lib/prisma';
import { assertEnvironmentIdentity, maskProjectRef, type AppEnv } from '../lib/appEnv';
import { readChainIdentity, EXPECTED_CHAIN_ID, type ChainIdentity } from '../lib/chainIdentity';

// ---------------------------------------------------------------------------
// "Which environment am I talking to?"
//
// Every previous answer to this question was DERIVED FROM CONTENT, and every one
// of them rotted. First "production holds 7 evidence records, staging 8" — which
// broke the moment production gained an eighth, i.e. the moment the bug it was
// really measuring got fixed. Then the article's fileHash, maintained by hand in
// a markdown handoff. A researcher about to make an irreversible, on-chain,
// public write was checking it against a table someone had to remember to
// update.
//
// Content changes; that is the entire point of the platform. So this reports
// CONFIGURATION and CHAIN — which change only when someone deliberately
// reconfigures a deployment — and treats the corpus as colour, never as the
// discriminator.
//
// Two independent axes, cross-checked:
//
//   1. APP_ENV, already validated at startup against the Supabase project the
//      connection strings actually name (assertEnvironmentIdentity). On its own
//      a label is a self-declaration; pinned against the real database it is a
//      verified fact, and `pinned: false` says so out loud rather than sounding
//      equally confident.
//   2. The chain the registry is on. Production anchors to Base mainnet, staging
//      to Base Sepolia.
//
// Agreement between them is the answer. One wrong variable cannot move both.
// ---------------------------------------------------------------------------

export type IdentityVerdict =
  /** Both axes agree. Safe to act on. */
  | 'CONFIRMED'
  /** The axes contradict each other — do not write until it is resolved. */
  | 'CONFLICT'
  /** Not enough evidence to cross-check: unpinned database, or an unreachable RPC. */
  | 'UNVERIFIED';

export interface CorpusFingerprint {
  trackedUrls: number;
  snapshots: number;
  snapshotsUnanchored: number;
  diffs: number;
  diffsSignificant: number;
  evidence: number;
  evidenceConfirmed: number;
  evidencePendingReview: number;
  theses: number;
  thesesPublished: number;
  activeResearchSessions: number;
}

export interface EnvironmentReport {
  environment: AppEnv;
  verdict: IdentityVerdict;
  /** Every reason the verdict is not CONFIRMED. Empty when it is. */
  warnings: string[];
  database: {
    /** Masked — never the full ref. This repo, and its logs, are public. */
    projectRef: string | null;
    pinned: boolean;
  };
  chain: ChainIdentity & { expectedChainId: number; matchesEnvironment: boolean | null };
  corpus: CorpusFingerprint;
}

export async function describeEnvironment(): Promise<EnvironmentReport> {
  // Throws only on a half-configured deployment — the same condition that stops
  // the process at startup, so in a running service this cannot fail.
  const identity = assertEnvironmentIdentity();
  const chain = await readChainIdentity();
  const expectedChainId = EXPECTED_CHAIN_ID[identity.appEnv];

  const matchesEnvironment = chain.reachable ? chain.chainId === expectedChainId : null;

  const warnings: string[] = [];

  if (!identity.pinned) {
    warnings.push(
      'EXPECTED_SUPABASE_PROJECT_REF is not set on this deployment, so APP_ENV has not been ' +
        'checked against the database it is actually connected to. The environment name below is ' +
        'a self-declaration, not a verified fact.',
    );
  }

  if (!chain.reachable) {
    warnings.push(
      `The chain axis could not be read (${chain.error}), so only one axis is available and ` +
        'nothing cross-checks the environment name.',
    );
  } else {
    if (!matchesEnvironment) {
      warnings.push(
        `CONTRADICTION: this deployment calls itself '${identity.appEnv}', which anchors to chain ` +
          `${String(expectedChainId)}, but its RPC reports chain ${String(chain.chainId)}. One of ` +
          'the two is wrong. Do not write evidence until it is resolved.',
      );
    }
    if (!chain.registryDeployed) {
      warnings.push(
        `CONTRADICTION: no contract exists at EVIDENCE_REGISTRY_ADDRESS ${chain.registryAddress} ` +
          `on chain ${String(chain.chainId)}. A transaction to a codeless address SUCCEEDS and ` +
          'returns a valid hash while anchoring nothing, which records fabricated chain of ' +
          'custody. Do not promote evidence until it is resolved.',
      );
    }
  }

  const contradicted = chain.reachable && (!matchesEnvironment || !chain.registryDeployed);
  const verdict: IdentityVerdict = contradicted
    ? 'CONFLICT'
    : identity.pinned && chain.reachable
      ? 'CONFIRMED'
      : 'UNVERIFIED';

  return {
    environment: identity.appEnv,
    verdict,
    warnings,
    database: {
      projectRef: identity.projectRef === null ? null : maskProjectRef(identity.projectRef),
      pinned: identity.pinned,
    },
    chain: { ...chain, expectedChainId, matchesEnvironment },
    corpus: await readCorpusFingerprint(),
  };
}

/**
 * Colour, not the discriminator — and labelled as such wherever it is rendered.
 * Useful for "does this look like the environment I left?", never for "which
 * environment is this?", because every count here moves whenever the platform is
 * used as intended.
 */
async function readCorpusFingerprint(): Promise<CorpusFingerprint> {
  const [
    trackedUrls,
    snapshots,
    snapshotsUnanchored,
    diffs,
    diffsSignificant,
    evidence,
    evidenceConfirmed,
    evidencePendingReview,
    theses,
    thesesPublished,
    activeResearchSessions,
  ] = await Promise.all([
    prisma.trackedUrl.count(),
    prisma.urlSnapshot.count(),
    prisma.urlSnapshot.count({ where: { onChainTxHash: null } }),
    prisma.urlVersionDiff.count(),
    prisma.urlVersionDiff.count({ where: { isLegallySignificant: true } }),
    prisma.evidence.count(),
    prisma.evidence.count({ where: { status: 'CONFIRMED' } }),
    prisma.evidence.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.thesis.count(),
    prisma.thesis.count({ where: { publishedVersionId: { not: null } } }),
    prisma.researchSession.count({ where: { status: 'ACTIVE' } }),
  ]);

  return {
    trackedUrls,
    snapshots,
    snapshotsUnanchored,
    diffs,
    diffsSignificant,
    evidence,
    evidenceConfirmed,
    evidencePendingReview,
    theses,
    thesesPublished,
    activeResearchSessions,
  };
}
