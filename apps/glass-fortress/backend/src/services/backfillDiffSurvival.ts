import { prisma } from '../lib/prisma';
import { auditDiffSurvival, SurvivalState } from './auditDiffSurvival';
import { computeDiffSurvival } from './computeDiffSurvival';

/**
 * GIVE THE ROWS WRITTEN BEFORE THE CHECK EXISTED THE VERDICT THEY LACK.
 *
 * WHAT THIS IS NOT. It does not repair a diff. It never touches `rawDeletedText`,
 * `rawAddedText`, the classification, or anything else a researcher relies on —
 * it writes the six survival columns and nothing else, and the compiler holds it
 * to that through `SurvivalColumns`.
 *
 * That distinction is the whole reason this is safe to run on real corpora. A
 * CONTRADICTED diff is WRITTEN, NOT REFUSED and NOT REPAIRED: the contradiction
 * is the finding, and the seven of them in each environment are the only
 * real-world material that can demonstrate the check fires at all. Recomputing
 * their classification to make the contradiction go away would destroy the
 * evidence that the pipeline is wrong — which is how this was found.
 *
 * IT CONVERGES. The work list is whatever the audit calls UNCHECKED or STALE, so
 * a second run over an already-backfilled corpus does nothing, and the audit —
 * which writes nothing — can be re-run afterwards to check it. Sharing
 * `survivalStateOf` with the audit is what keeps "needs checking" from becoming
 * two definitions that can disagree about the same row.
 */

export interface BackfillReport {
  /** Diffs the audit found in a state needing a verdict. */
  eligible: number;
  written: number;
  /** Broken down so "nothing to do" is distinguishable from "nothing eligible". */
  fromUnchecked: number;
  fromStale: number;
  dryRun: boolean;
}

export async function backfillDiffSurvival(
  opts: { dryRun?: boolean } = {},
): Promise<BackfillReport> {
  const dryRun = opts.dryRun ?? false;
  const audit = await auditDiffSurvival();

  const needsVerdict: SurvivalState[] = ['UNCHECKED', 'STALE'];
  const eligible = audit.diffs.filter((d) => needsVerdict.includes(d.state));

  const report: BackfillReport = {
    eligible: eligible.length,
    written: 0,
    fromUnchecked: eligible.filter((d) => d.state === 'UNCHECKED').length,
    fromStale: eligible.filter((d) => d.state === 'STALE').length,
    dryRun,
  };
  if (dryRun) return report;

  for (const entry of eligible) {
    // Re-read rather than carrying the audit's copy: the audit selected what it
    // needed to CLASSIFY a row, and the checker's inputs must come from stored
    // state at the moment of checking, not from a snapshot of it taken earlier.
    const diff = await prisma.urlVersionDiff.findUniqueOrThrow({
      where: { id: entry.diffId },
      select: {
        beforeSnapshotId: true,
        afterSnapshotId: true,
        rawDeletedText: true,
        rawAddedText: true,
      },
    });

    const survival = await computeDiffSurvival({
      beforeSnapshotId: diff.beforeSnapshotId,
      afterSnapshotId: diff.afterSnapshotId,
      rawDeletedText: diff.rawDeletedText,
      rawAddedText: diff.rawAddedText,
    });

    // The survival columns alone. Spreading a wider object here is how a backfill
    // becomes a repair without anyone deciding that it should.
    await prisma.urlVersionDiff.update({ where: { id: entry.diffId }, data: survival });
    report.written += 1;
  }

  return report;
}
