import { z } from 'zod';
import { prisma } from '../../lib/prisma';

// ---------------------------------------------------------------------------
// get_scan_findings
//
// Everything a forensic scan of one page found and has not yet had reviewed.
//
// Scans do not promote their own findings — see recordScanFinding. A scan
// classifies page changes and records the ones that advance a standing
// investigative concern as PENDING_REVIEW; a human decides whether they become
// evidence.
//
// Keyed by the tracked URL rather than by a scan run, deliberately. Re-scanning
// a page appends to the same pool of pending findings, so "everything still
// awaiting review for this page" is always the right question. Run-scoped
// batches would strand the findings of any run nobody got around to reviewing.
//
// Returns the classifier's REASONING alongside each finding, not just the rows.
// The point of review is noticing that the classifier flagged three cosmetic
// edits and missed a real one — which is invisible if the tool returns a list
// to tick.
// ---------------------------------------------------------------------------

export const getScanFindingsSchema = {
  url: z
    .string()
    .url()
    .describe('The tracked URL whose scan findings should be listed'),
};

interface Finding {
  fileHash: string;
  evidenceId: string;
  summary: string;
  evidenceTier: string;
  investigativeCategories: string[];
  /** The change window this finding came from. */
  beforeDate: string;
  afterDate: string;
  /** Wayback viewer link for the "after" snapshot — the citable archived source. */
  snapshotUrl: string;
  /** ForensicAgent's Hebrew explanation of why this change matters. */
  aiSignificance: string;
  deletedItems: unknown[];
  addedItems: unknown[];
}

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getScanFindingsHandler(input: { url: string }): Promise<string> {
  const tracked = await prisma.trackedUrl.findUnique({
    where: { url: input.url },
    select: { id: true, url: true, title: true, status: true },
  });

  if (!tracked) {
    return JSON.stringify({
      error: `No tracked URL found for: ${input.url}`,
      explanation: 'Nothing has scanned this page. Run start_forensic_scan first.',
    });
  }

  const diffs = await prisma.urlVersionDiff.findMany({
    where: { trackedUrlId: tracked.id, isLegallySignificant: true },
    orderBy: { afterDate: 'asc' },
    select: {
      beforeDate: true,
      afterDate: true,
      snapshotUrl: true,
      aiSignificance: true,
      deletedText: true,
      addedText: true,
      evidence: {
        select: {
          id: true,
          fileHash: true,
          status: true,
          summary: true,
          evidenceTier: true,
          investigativeCategories: true,
          onChainTxHash: true,
        },
      },
    },
  });

  const pending: Finding[] = [];
  let confirmed = 0;
  // A significant diff with no Evidence row means recordScanFinding refused it
  // (no investigative category matched) or failed. Counted, not hidden — a scan
  // that silently drops findings is indistinguishable from one that found none.
  let unrecorded = 0;

  for (const diff of diffs) {
    const record = diff.evidence[0];
    if (!record) {
      unrecorded++;
      continue;
    }
    if (record.status === 'CONFIRMED') {
      confirmed++;
      continue;
    }

    pending.push({
      fileHash: record.fileHash,
      evidenceId: record.id,
      summary: record.summary,
      evidenceTier: record.evidenceTier,
      investigativeCategories: record.investigativeCategories,
      beforeDate: diff.beforeDate,
      afterDate: diff.afterDate,
      snapshotUrl: diff.snapshotUrl,
      aiSignificance: diff.aiSignificance,
      deletedItems: parseJsonArray(diff.deletedText),
      addedItems: parseJsonArray(diff.addedText),
    });
  }

  return JSON.stringify({
    url: tracked.url,
    title: tracked.title,
    scanStatus: tracked.status,
    significantDiffs: diffs.length,
    pendingReview: pending.length,
    alreadyConfirmed: confirmed,
    unrecorded,
    explanation:
      pending.length > 0
        ? 'These findings were classified as legally significant and are awaiting a human decision. Nothing here is on-chain or publicly searchable yet. Promote them with promote_scan_findings once reviewed.'
        : 'Nothing is awaiting review for this page.',
    findings: pending,
  });
}
