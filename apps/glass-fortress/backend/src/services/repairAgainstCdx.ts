import { prisma } from '../lib/prisma';
import { fetchCaptureBytes } from '../lib/archiveHttp';
import { deriveText } from '../lib/captureDocument';
import { cdxDigestOf, verifyAgainstCdx } from './verifyAgainstCdx';

/**
 * Repair captures whose stored payload does not reproduce the Archive's digest.
 *
 * KEYED ON VERIFICATION FAILURE, not on a null column. `document` and
 * `documentHash` are NOT NULL as of 20260827180000, so the obvious repair —
 * null them and let the backfill refill — cannot run: it violates the
 * constraint, and making it run would mean dropping the constraint, nulling,
 * backfilling and re-adding it. Three migrations and a degraded window to fix
 * seven rows, with the constraint absent exactly while the data is worst.
 *
 * Keying on the check instead is self-targeting and idempotent: it converges on
 * repeated runs and **cannot touch a row that is already correct**, which the
 * `documentHash IS NULL` guard could never promise once the column was full.
 *
 * IT STILL NEVER SILENTLY OVERWRITES, because it discriminates between the two
 * reasons a stored payload can disagree with the index:
 *
 *   fresh identity fetch MATCHES cdx  → our stored bytes were wrong. Repair.
 *   fresh identity fetch ALSO differs → the Archive's replay disagrees with its
 *                                       own index. Do not overwrite; record it.
 *
 * The second is the residual Archive inconsistency this work was originally
 * chasing, and it is only measurable once our own loss is out of the way. The
 * rule that a refetch disagreeing with a stored payload is a FINDING survives
 * intact — the difference here is that we can prove which side is wrong rather
 * than assume it.
 */

export interface RepairOutcome {
  waybackTimestamp: string;
  action: 'REPAIRED' | 'ARCHIVE_CONTRADICTED' | 'FAILED';
  cdxDigest: string | null;
  storedBefore: string;
  fetched?: string;
  bytesBefore: number;
  bytesAfter?: number;
  contentEncoding?: string | null;
  error?: string;
}

export interface RepairReport {
  url: string;
  dryRun: boolean;
  contradictedBefore: number;
  repaired: number;
  archiveContradicted: number;
  failed: number;
  outcomes: RepairOutcome[];
}

/** Milliseconds between Archive requests — respects rate limits. */
const FETCH_DELAY_MS = 1_500;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function repairAgainstCdx(opts: {
  url: string;
  dryRun: boolean;
}): Promise<RepairReport> {
  const verification = await verifyAgainstCdx(opts.url);
  const targets = verification.verdicts.filter((v) => v.verdict === 'CONTRADICTED');

  const outcomes: RepairOutcome[] = [];

  for (const target of targets) {
    if (opts.dryRun) {
      outcomes.push({
        waybackTimestamp: target.waybackTimestamp,
        action: 'REPAIRED',
        cdxDigest: target.cdxDigest,
        storedBefore: target.ourDigest,
        bytesBefore: target.bytes,
      });
      continue;
    }

    try {
      const { bytes, contentType, contentEncoding } = await fetchCaptureBytes(
        opts.url,
        target.waybackTimestamp,
      );
      const fetched = cdxDigestOf(bytes);

      if (fetched !== target.cdxDigest) {
        // The Archive's replay disagrees with the Archive's own index. Our bytes
        // are not demonstrably wrong, so they are LEFT ALONE and the
        // disagreement is reported — overwriting here would replace one
        // unverifiable payload with another and destroy the evidence of it.
        outcomes.push({
          waybackTimestamp: target.waybackTimestamp,
          action: 'ARCHIVE_CONTRADICTED',
          cdxDigest: target.cdxDigest,
          storedBefore: target.ourDigest,
          fetched,
          bytesBefore: target.bytes,
          bytesAfter: bytes.length,
          contentEncoding,
        });
        await sleep(FETCH_DELAY_MS);
        continue;
      }

      const derived = deriveText(bytes, contentType, contentEncoding);

      // Guarded on the WRONG hash we set out to replace — the optimistic-
      // concurrency equivalent of the `IS NULL` guard. If anything changed the
      // row since verification read it, this updates nothing rather than
      // overwriting work it never saw.
      const updated = await prisma.$executeRaw`
        UPDATE "UrlSnapshot"
        SET "document" = ${bytes},
            "documentHash" = ${fetched},
            "documentContentType" = ${contentType},
            "documentContentEncoding" = ${contentEncoding},
            "text" = ${derived.text},
            "textHash" = ${derived.textHash},
            "textExtractionVersion" = ${derived.textExtractionVersion}
        WHERE "id" = ${target.snapshotId} AND "documentHash" = ${target.ourDigest}
      `;

      outcomes.push({
        waybackTimestamp: target.waybackTimestamp,
        action: updated === 1 ? 'REPAIRED' : 'FAILED',
        cdxDigest: target.cdxDigest,
        storedBefore: target.ourDigest,
        fetched,
        bytesBefore: target.bytes,
        bytesAfter: bytes.length,
        contentEncoding,
        ...(updated === 1 ? {} : { error: 'row changed since verification — nothing written' }),
      });
    } catch (err) {
      outcomes.push({
        waybackTimestamp: target.waybackTimestamp,
        action: 'FAILED',
        cdxDigest: target.cdxDigest,
        storedBefore: target.ourDigest,
        bytesBefore: target.bytes,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await sleep(FETCH_DELAY_MS);
  }

  return {
    url: opts.url,
    dryRun: opts.dryRun,
    contradictedBefore: targets.length,
    repaired: outcomes.filter((o) => o.action === 'REPAIRED').length,
    archiveContradicted: outcomes.filter((o) => o.action === 'ARCHIVE_CONTRADICTED').length,
    failed: outcomes.filter((o) => o.action === 'FAILED').length,
    outcomes,
  };
}
