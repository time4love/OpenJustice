import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { promoteEvidence } from '../../services/promoteEvidence';

// ---------------------------------------------------------------------------
// promote_scan_findings
//
// Confirm every pending finding from a page's forensic scans: register each on
// the evidence registry, index it for search, and mark it CONFIRMED.
//
// This is the human decision that a scan deliberately does not make for itself.
// It promotes exactly what the classifier flagged as legally significant — there
// is no per-item opt-out, and that absence is honest rather than accidental.
// An exclusion list would encode "the researcher disagrees with finding #3" as a
// parameter on someone else's call, while the capability actually missing —
// DEMOTING a diff the classifier marked significant, so it stops being offered —
// stayed missing. A researcher who disagrees today has only delete_evidence,
// which destroys the record rather than reclassifying it.
//
// Promotion runs through the same promoteEvidence() service as every other path,
// so a finding confirmed here is indistinguishable from one confirmed
// individually — same registration, same indexing, same meaning of CONFIRMED.
// ---------------------------------------------------------------------------

export const promoteScanFindingsSchema = {
  url: z
    .string()
    .url()
    .describe('The tracked URL whose pending scan findings should all be confirmed'),
};

interface PromotionOutcome {
  fileHash: string;
  evidenceId: string;
  promoted: boolean;
  alreadyConfirmed?: boolean;
  txHash?: string;
  error?: string;
}

export async function promoteScanFindingsHandler(input: { url: string }): Promise<string> {
  const tracked = await prisma.trackedUrl.findUnique({
    where: { url: input.url },
    select: { id: true },
  });

  if (!tracked) {
    return JSON.stringify({ error: `No tracked URL found for: ${input.url}` });
  }

  const pending = await prisma.evidence.findMany({
    where: {
      status: 'PENDING_REVIEW',
      urlVersionDiff: { trackedUrlId: tracked.id, isLegallySignificant: true },
    },
  });

  if (pending.length === 0) {
    return JSON.stringify({
      url: input.url,
      promoted: 0,
      failed: 0,
      explanation:
        'Nothing was awaiting review for this page. Run get_scan_findings to see what a scan has produced.',
      outcomes: [],
    });
  }

  const outcomes: PromotionOutcome[] = [];

  // Sequential, not concurrent. Each promotion sends a transaction from the same
  // registrar wallet, and parallel sends race on the account nonce — the
  // failures that produces look like random registration errors and are
  // miserable to diagnose. A scan yields findings in single digits, so ordering
  // them costs little.
  for (const record of pending) {
    try {
      const result = await promoteEvidence(record);
      outcomes.push({
        fileHash: record.fileHash,
        evidenceId: record.id,
        promoted: result.promoted,
        ...(result.alreadyConfirmed ? { alreadyConfirmed: true } : {}),
        txHash: result.txHash,
      });
    } catch (err) {
      // One failure must not abandon the rest: a partially promoted batch is
      // recoverable by re-running this tool, but an aborted one leaves the
      // researcher unable to tell which findings were handled.
      outcomes.push({
        fileHash: record.fileHash,
        evidenceId: record.id,
        promoted: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const promoted = outcomes.filter((o) => o.promoted).length;
  const failed = outcomes.filter((o) => o.error).length;

  return JSON.stringify({
    url: input.url,
    promoted,
    failed,
    total: outcomes.length,
    explanation:
      failed > 0
        ? `${promoted} of ${outcomes.length} findings were confirmed and registered on-chain. ${failed} failed and remain PENDING_REVIEW — re-run this tool to retry only those.`
        : `All ${promoted} findings were confirmed and registered on-chain. Verify any of them with check_on_chain_status.`,
    outcomes,
  });
}
