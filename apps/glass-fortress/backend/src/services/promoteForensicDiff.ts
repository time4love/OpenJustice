import { prisma } from '../lib/prisma';
import { Web3Service } from './Web3Service';
import { buildForensicEvidence } from './forensicEvidence';
import { registerEvidenceOnChain } from './evidenceOnChain';
import { investigativeCategoriesField } from '../lib/investigativeCategories';
import type { DiffItem } from './ForensicAgent';

// ---------------------------------------------------------------------------
// Promote a UrlVersionDiff to evidence, by hand.
//
// The deliberate override. A forensic scan records only the changes its
// classifier marked legally significant, and that classifier is not
// deterministic: re-running a completed scan of one government page on
// 2026-08-22 flagged 5 changes where an earlier run of the same page had
// flagged 10 — same diffs, same boundaries, opposite verdicts on five of them.
//
// So a researcher must be able to promote a change the classifier passed over.
// This path is therefore NOT gated on investigativeCategories being non-empty,
// unlike recordScanFinding: refusing here would make the classifier's judgment
// final, which is exactly the property that makes non-determinism dangerous.
//
// Extracted from the /api/forensics/promote route so the MCP tool and the UI
// button promote identically — same duplicate detection, same on-chain
// behaviour, same meaning of CONFIRMED. Two paths that "promote a diff" must
// not be able to disagree about what that produces.
// ---------------------------------------------------------------------------

/**
 * The argument that justified promoting a change the classifier passed over,
 * stored alongside the evidence it produced.
 *
 * Optional at this layer because the UI's promote button predates the debate
 * flow and still promotes without one. That is a real gap — a gate the MCP path
 * enforces and the button does not — and closing it needs the button to collect
 * a rationale too. Tracked, not silently accepted.
 */
export type PromoteForensicDiffResult =
  | { outcome: 'promoted'; evidenceId: string; fileHash: string; txHash: string | null; confirmed: boolean }
  | { outcome: 'diff_not_found'; urlVersionDiffId: string }
  | { outcome: 'already_promoted'; evidenceId: string; fileHash: string; matchedBy: 'diff' | 'content' }
  | { outcome: 'chain_error'; message: string };

let _web3: Web3Service | null = null;
let _web3Attempted = false;

function getWeb3Service(): Web3Service | null {
  if (_web3Attempted) return _web3;
  _web3Attempted = true;
  try {
    _web3 = new Web3Service();
  } catch {
    _web3 = null;
  }
  return _web3;
}

function parseDiffItems(raw: string): DiffItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DiffItem[]) : [];
  } catch {
    return [];
  }
}

export async function promoteForensicDiff(
  urlVersionDiffId: string,
): Promise<PromoteForensicDiffResult> {
  const diff = await prisma.urlVersionDiff.findUnique({
    where: { id: urlVersionDiffId },
    include: { trackedUrl: true },
  });

  if (!diff) return { outcome: 'diff_not_found', urlVersionDiffId };

  const existing = await prisma.evidence.findFirst({ where: { urlVersionDiffId } });
  if (existing) {
    return {
      outcome: 'already_promoted',
      evidenceId: existing.id,
      fileHash: existing.fileHash,
      matchedBy: 'diff',
    };
  }

  // Classification carried over from the ForensicAgent run that produced the
  // diff. Validated rather than cast — a value outside the taxonomy means the
  // row predates it or was written by hand, which should fail loudly rather
  // than reach the evidence corpus.
  const investigativeCategories = investigativeCategoriesField.parse(diff.investigativeCategories);

  const { fileHash, data } = buildForensicEvidence({
    diffId: diff.id,
    url: diff.trackedUrl.url,
    afterDate: diff.afterDate,
    snapshotUrl: diff.snapshotUrl,
    aiSignificance: diff.aiSignificance,
    investigativeCategories,
    deletedText: diff.deletedText,
    addedText: diff.addedText,
    deletedItems: parseDiffItems(diff.deletedText),
    addedItems: parseDiffItems(diff.addedText),
  });

  // fileHash is content-addressed (url + afterDate + deletedText + addedText),
  // so a DIFFERENT diff — e.g. a rescan re-detecting the same change over an
  // overlapping date range — can compute this exact hash. Check explicitly
  // rather than letting create() throw a raw unique-constraint error.
  const existingByHash = await prisma.evidence.findUnique({ where: { fileHash } });
  if (existingByHash) {
    return {
      outcome: 'already_promoted',
      evidenceId: existingByHash.id,
      fileHash: existingByHash.fileHash,
      matchedBy: 'content',
    };
  }

  let registration;
  try {
    registration = await registerEvidenceOnChain(
      getWeb3Service(),
      fileHash,
      data.investigativeCategories,
      data.evidenceRole,
    );
  } catch (err) {
    return { outcome: 'chain_error', message: err instanceof Error ? err.message : String(err) };
  }

  // registration.confirmed can be false without a thrown error: the hash was a
  // duplicate on-chain but its original transaction could not be recovered.
  // Never write CONFIRMED without a real txHash to show for it.
  const record = await prisma.evidence.create({
    data: {
      ...data,
      status: registration.confirmed ? 'CONFIRMED' : 'PENDING_REVIEW',
      onChainTxHash: registration.txHash,
    },
  });

  return {
    outcome: 'promoted',
    evidenceId: record.id,
    fileHash,
    txHash: registration.txHash,
    confirmed: registration.confirmed,
  };
}
