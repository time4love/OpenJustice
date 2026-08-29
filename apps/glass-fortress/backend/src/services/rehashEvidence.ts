import { IntegrityCheckSubject } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Web3Service } from './Web3Service';
import { recordOnChainCheckNeverThrowing } from './onChainVerification';
import { VectorStoreService } from './VectorStoreService';
import { forensicEvidenceFileHash, requireSnapshotIdentity } from './forensicEvidence';

// ---------------------------------------------------------------------------
// Moving forensic evidence onto the snapshot-derived identity.
//
// The previous fileHash was computed over url + afterDate + deletedText +
// addedText, where the latter two are JSON of the classifier's extracted items —
// mostly model prose. Reclassification rewrites them, so five of seven anchored
// records could no longer be recomputed from the database. A content address you
// cannot recompute is a random database key with extra steps, which is exactly
// what the design chose the hash over a UUID to avoid.
//
// The replacement is derived from the two archived captures: their Wayback
// timestamps and their contentHash values. Those cannot drift — UrlSnapshot rows
// are upserted with `update: {}` and their text is never rewritten — and they are
// now anchored on-chain in their own right, so the new identity is anchored by
// composition rather than by assertion.
//
// The old anchors stay on-chain and match nothing derivable. That orphan is
// deliberate and is recorded on the row (previousFileHash / previousOnChainTxHash)
// because an orphaned anchor with a stated cause is a migration, and one without
// is indistinguishable from tampering.
// ---------------------------------------------------------------------------

export interface RehashRow {
  evidenceId: string;
  previousFileHash: string;
  newFileHash: string;
  newTxHash: string | null;
  mentionsUpdated: number;
  reindexed: boolean;
}

export interface RehashReport {
  examined: number;
  rehashed: number;
  /** Already on the snapshot-derived identity — nothing to do. */
  alreadyCurrent: number;
  failed: number;
  failures: { evidenceId: string; reason: string }[];
  dryRun: boolean;
  chainAvailable: boolean;
  rows: RehashRow[];
}

export async function rehashEvidence(opts: { dryRun: boolean; limit?: number }): Promise<RehashReport> {
  const records = await prisma.evidence.findMany({
    where: { NOT: { urlVersionDiffId: null } },
    select: {
      id: true,
      fileHash: true,
      summary: true,
      status: true,
      onChainTxHash: true,
      urlVersionDiff: {
        select: {
          trackedUrl: { select: { url: true } },
          beforeSnapshot: { select: { waybackTimestamp: true, contentHash: true } },
          afterSnapshot: { select: { waybackTimestamp: true, contentHash: true } },
        },
      },
    },
    orderBy: { evidenceDate: 'asc' },
    ...(opts.limit ? { take: opts.limit } : {}),
  });

  const report: RehashReport = {
    examined: records.length,
    rehashed: 0,
    alreadyCurrent: 0,
    failed: 0,
    failures: [],
    dryRun: opts.dryRun,
    chainAvailable: true,
    rows: [],
  };

  let web3: Web3Service | null = null;
  if (!opts.dryRun && records.length > 0) {
    try {
      web3 = new Web3Service();
    } catch (err) {
      report.chainAvailable = false;
      report.failures.push({ evidenceId: '-', reason: err instanceof Error ? err.message : String(err) });
      return report;
    }
  }

  for (const rec of records) {
    try {
      const diff = rec.urlVersionDiff;
      if (!diff) throw new Error('evidence has no linked diff');

      const newFileHash = forensicEvidenceFileHash(
        diff.trackedUrl.url,
        requireSnapshotIdentity(diff.beforeSnapshot, 'before'),
        requireSnapshotIdentity(diff.afterSnapshot, 'after'),
      );

      if (newFileHash === rec.fileHash) {
        report.alreadyCurrent++;
        continue;
      }

      const row: RehashRow = {
        evidenceId: rec.id,
        previousFileHash: rec.fileHash,
        newFileHash,
        newTxHash: null,
        mentionsUpdated: 0,
        reindexed: false,
      };

      if (opts.dryRun) {
        report.rows.push(row);
        continue;
      }

      // Anchor the new identity before writing it. If registration fails the row
      // keeps its old hash and its old anchor — a consistent, if stale, state —
      // rather than a fresh hash with nothing behind it, which is the
      // UNANCHORED_CONFIRMED condition the 2026-08-20 audit found and this
      // platform exists not to produce.
      const { registered } = await web3!.isHashRegistered(newFileHash);
      row.newTxHash = registered
        ? await web3!.findRegisteringTxHash(newFileHash)
        : await web3!.registerEvidenceHash(
            newFileHash,
            '0x0000000000000000000000000000000000000000',
            'Forensic Evidence',
          );
      if (!row.newTxHash) throw new Error('registered but registering transaction not found');

      // Citations reference evidence by fileHash, so they move with it. Zero rows
      // today; doing it anyway, because a migration that is only correct while a
      // table happens to be empty is a trap for whoever fills it.
      const mentions = await prisma.thesisMention.updateMany({
        where: { type: 'EVIDENCE', refId: rec.fileHash },
        data: { refId: newFileHash },
      });
      row.mentionsUpdated = mentions.count;

      await prisma.evidence.update({
        where: { id: rec.id },
        data: {
          fileHash: newFileHash,
          previousFileHash: rec.fileHash,
          previousOnChainTxHash: rec.onChainTxHash,
          onChainTxHash: row.newTxHash,
        },
      });

      // LEVEL 3a — the identity moved, so the ANCHOR CLAIM moved with it.
      //
      // This path is the one where a stale verdict would be most misleading:
      // any earlier check was about `previousFileHash`, and the row now asserts
      // an anchor for a hash nothing has ever verified. Recorded here so the
      // audit sees the new claim rather than an old pass that no longer
      // describes the record.
      await recordOnChainCheckNeverThrowing({
        subjectType: IntegrityCheckSubject.EVIDENCE,
        subjectId: rec.id,
        fileHash: newFileHash,
      });

      if (rec.status === 'CONFIRMED') {
        try {
          const store = await VectorStoreService.create();
          await store.upsertEvidence(rec.summary, newFileHash);
          row.reindexed = true;
        } catch (err) {
          row.reindexed = false;
          console.warn(
            `[rehash] vector re-index failed for ${newFileHash}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      report.rehashed++;
      report.rows.push(row);
    } catch (err) {
      report.failed++;
      report.failures.push({
        evidenceId: rec.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
