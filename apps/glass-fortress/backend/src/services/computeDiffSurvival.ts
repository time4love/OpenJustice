import { Prisma, SurvivalVerdict } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { checkDiffSurvival, survivalSourceStateHash } from '../lib/diffSurvival';

/**
 * LEVEL 5'S VERDICT, COMPUTED AGAINST STORED STATE, IN ONE PLACE.
 *
 * WHY THIS IS ITS OWN MODULE. Three callers need this and they are three
 * different kinds of act:
 *
 *   - `recordDiff`            — a diff is being written for the first time
 *   - `rediffFromSnapshots`   — a diff's reported chunks are being REWRITTEN
 *   - `backfillDiffSurvival`  — rows written before the check existed
 *
 * Only the first is a diff write, so this cannot live inside the single writer
 * without the other two importing "the module that writes diffs" in order not to
 * write one. Copying it into each would be one rule with three implementations —
 * this repository's dominant defect shape, and here the copies would be three
 * definitions of what a contradiction IS.
 *
 * COMPUTED AGAINST STORED TEXT, DELIBERATELY. Every caller has the capture text
 * in memory or could fetch it more cheaply; none of them may. A verdict must be
 * re-derivable from stored state, so it has to be computed FROM stored state — a
 * verdict derived from in-memory text would carry a `sourceStateHash` that
 * nothing could reproduce, which is a provenance record that cannot be checked.
 *
 * The cost is one indexed read per diff of a pure local function — no Archive, no
 * model, no network — which is what makes an invariant affordable at write time
 * instead of as a script somebody remembers to run.
 */

/** Exactly the columns a verdict occupies, so no caller invents a fourth shape. */
export interface SurvivalColumns {
  survivalVerdict: SurvivalVerdict;
  survivalCheckedAt: Date;
  survivalSourceStateHash: string;
  survivalTextVersion: string;
  survivalContradicted: Prisma.InputJsonValue;
  survivalChunksChecked: number;
}

/**
 * The checker's four inputs, named at the boundary.
 *
 * The two chunk payloads are passed in rather than re-read because the caller is
 * often the reason they changed — `rediffFromSnapshots` has just computed them
 * and has not written them yet. The CAPTURES are always re-read, because those
 * the caller must not be trusted for.
 */
export interface SurvivalInput {
  beforeSnapshotId: string;
  afterSnapshotId: string;
  rawDeletedText: string;
  rawAddedText: string;
}

export async function computeDiffSurvival(input: SurvivalInput): Promise<SurvivalColumns> {
  const [before, after] = await Promise.all([
    prisma.urlSnapshot.findUniqueOrThrow({
      where: { id: input.beforeSnapshotId },
      select: { text: true, textHash: true, textExtractionVersion: true },
    }),
    prisma.urlSnapshot.findUniqueOrThrow({
      where: { id: input.afterSnapshotId },
      select: { text: true, textHash: true, textExtractionVersion: true },
    }),
  ]);

  const result = checkDiffSurvival({
    rawDeletedText: input.rawDeletedText,
    rawAddedText: input.rawAddedText,
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
    // The SAME four values the check ran on, so the commitment is to what was
    // actually checked rather than to what the row happens to hold afterwards.
    survivalSourceStateHash: survivalSourceStateHash({
      beforeTextHash: before.textHash,
      afterTextHash: after.textHash,
      rawDeletedText: input.rawDeletedText,
      rawAddedText: input.rawAddedText,
    }),
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

/**
 * A diff's chunk payload as a string the checker can read.
 *
 * Prisma's create/update input types admit `string | StringFieldUpdateOperations`
 * and `undefined`, and the check must run on the SAME value the hash commits to.
 * Narrowing once, here, is what keeps those two from drifting apart — doing it
 * separately at each use is how a verdict comes to be stored against a payload it
 * was not computed from.
 */
export function chunkPayload(value: unknown): string {
  return typeof value === 'string' ? value : '[]';
}
