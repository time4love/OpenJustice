import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { chunkPayload, computeDiffSurvival } from './computeDiffSurvival';

/**
 * THE ONE WAY A DIFF IS WRITTEN.
 *
 * WHY THIS EXISTS. `UrlVersionDiff` was written from EIGHT `create` call sites,
 * all in `WaybackScraper.ts`, with no constraint of any kind on the model. So a
 * from-scratch rescan duplicated every diff it re-derived — the hazard Level 1
 * had to route around with a bespoke recovery instrument rather than an ordinary
 * scan.
 *
 * One rule, eight implementations, is this repository's dominant defect shape.
 * Funnelling them is the fix; the constraint is what makes a rescan CONVERGE
 * instead of accumulate.
 *
 * IDENTITY IS THE CAPTURE PAIR, decided by measurement. Both environments hold a
 * date pair spanning two different transitions — 2022-05-03 -> 2022-05-03, three
 * captures on one day — so keying on dates would collapse them and discard a real
 * transition. Worse, it would discard exactly the same-day revert material
 * `recordCapture`'s novelty rule exists to preserve: Level 1's defect, one layer
 * up.
 *
 * BOTH IDS ARE REQUIRED, not optional. A diff whose captures we do not hold is
 * unverifiable by construction — Level 5 checks a reported change against the
 * documents, and there would be none. Making them required means the COMPILER
 * names every call site that cannot supply them, rather than a NULL appearing at
 * runtime in a row nothing can ever validate.
 *
 * ENFORCED BY A SOURCE SCAN, not by this comment: `urlVersionDiff.create` and
 * `urlVersionDiff.upsert` may appear in this file and nowhere else. See
 * test/diffSingleWriter.test.ts.
 */

/** A diff write, with the pair it spans required. */
export type DiffWrite = Omit<
  Prisma.UrlVersionDiffUncheckedCreateInput,
  'beforeSnapshotId' | 'afterSnapshotId'
> & {
  beforeSnapshotId: string;
  afterSnapshotId: string;
};

/**
 * Write a diff, keyed on the captures it spans.
 *
 * UPSERT rather than CREATE, deliberately. Re-deriving a diff for a pair already
 * held is not an error and must not become a duplicate: a rescan re-computes what
 * it re-reads, and the second run should leave the corpus where the first did.
 * The classification on the row is replaced, because a re-run under a newer
 * classifier version is a better answer to the same question — the provenance
 * columns say which version produced it.
 *
 * LEVEL 5 RUNS HERE, at write, via `computeDiffSurvival` — the same computation
 * the re-derivation tool and the backfill use. A CONTRADICTED diff is WRITTEN,
 * NOT REFUSED: refusing it would delete the evidence that the pipeline is wrong,
 * which is how this was found. It is simply never promotable.
 */
export async function recordDiff(data: DiffWrite): Promise<{ id: string }> {
  const survival = await computeDiffSurvival({
    beforeSnapshotId: data.beforeSnapshotId,
    afterSnapshotId: data.afterSnapshotId,
    rawDeletedText: chunkPayload(data.rawDeletedText),
    rawAddedText: chunkPayload(data.rawAddedText),
  });
  const row = { ...data, ...survival };

  return prisma.urlVersionDiff.upsert({
    where: {
      beforeSnapshotId_afterSnapshotId: {
        beforeSnapshotId: data.beforeSnapshotId,
        afterSnapshotId: data.afterSnapshotId,
      },
    },
    create: row,
    update: row,
    select: { id: true },
  });
}
