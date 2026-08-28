import { Prisma, SurvivalVerdict } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { checkDiffSurvival, survivalSourceStateHash } from '../lib/diffSurvival';

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
 */
export async function recordDiff(data: DiffWrite): Promise<{ id: string }> {
  const survival = await computeSurvival(data);
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

/**
 * LEVEL 5 AT WRITE TIME.
 *
 * Reads the two captures' STORED text rather than taking it from the caller, and
 * that is deliberate: the verdict must be re-derivable from stored state, so it
 * has to be computed against stored state. A verdict computed from text held in
 * memory would carry a `sourceStateHash` that nothing could reproduce.
 *
 * The cost is one indexed read per diff, of a pure local function — no Archive,
 * no model, no network — which is what makes an invariant affordable at write
 * time instead of as a script somebody remembers to run.
 */
async function computeSurvival(data: DiffWrite): Promise<{
  survivalVerdict: SurvivalVerdict;
  survivalCheckedAt: Date;
  survivalSourceStateHash: string;
  survivalTextVersion: string;
  survivalContradicted: Prisma.InputJsonValue;
  survivalChunksChecked: number;
}> {
  const [before, after] = await Promise.all([
    prisma.urlSnapshot.findUniqueOrThrow({
      where: { id: data.beforeSnapshotId },
      select: { text: true, textHash: true, textExtractionVersion: true },
    }),
    prisma.urlSnapshot.findUniqueOrThrow({
      where: { id: data.afterSnapshotId },
      select: { text: true, textHash: true, textExtractionVersion: true },
    }),
  ]);

  const result = checkDiffSurvival({
    rawDeletedText: typeof data.rawDeletedText === 'string' ? data.rawDeletedText : '[]',
    rawAddedText: typeof data.rawAddedText === 'string' ? data.rawAddedText : '[]',
    beforeText: before.text,
    afterText: after.text,
    beforeVersion: before.textExtractionVersion,
    afterVersion: after.textExtractionVersion,
  });

  return {
    // No cast: the checker's verdict union and the Prisma enum have the same
    // members, so the compiler already agrees. A cast here would be an escape
    // hatch hiding a divergence if they ever stopped agreeing.
    survivalVerdict: result.verdict,
    survivalCheckedAt: new Date(),
    survivalSourceStateHash: survivalSourceStateHash(before.textHash, after.textHash),
    // The versions agree unless the verdict is UNCHECKABLE, which is exactly what
    // a disagreement produces — so recording the before side is unambiguous.
    survivalTextVersion: before.textExtractionVersion,
    // Serialised through the JSON boundary explicitly rather than cast: Prisma's
    // InputJsonValue does not accept an interface, and a cast would silently
    // accept a shape that later fails at the database.
    survivalContradicted: result.contradicted.map((c) => ({ side: c.side, excerpt: c.excerpt })),
    survivalChunksChecked: result.chunksChecked,
  };
}
