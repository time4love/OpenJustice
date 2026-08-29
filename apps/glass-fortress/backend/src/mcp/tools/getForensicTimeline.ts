import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import {
  diffSurvivalView,
  SURVIVAL_VIEW_SELECT,
} from '../../services/auditDiffSurvival';
import {
  CLASSIFICATION_PROVENANCE_SELECT,
  classificationInputView,
} from '../../lib/classificationProvenance';

export const getForensicTimelineSchema = {
  url: z.string().url().describe('The tracked URL to retrieve forensic diff history for'),
};

export async function getForensicTimelineHandler(input: { url: string }): Promise<string> {
  const tracked = await prisma.trackedUrl.findFirst({
    where: { url: input.url },
    include: {
      diffs: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          beforeDate: true,
          afterDate: true,
          snapshotUrl: true,
          deletedText: true,
          addedText: true,
          aiSignificance: true,
          isLegallySignificant: true,
          createdAt: true,
          ...SURVIVAL_VIEW_SELECT,
          ...CLASSIFICATION_PROVENANCE_SELECT,
        },
      },
    },
  });

  if (!tracked) {
    return JSON.stringify({ error: `No tracked URL found for: ${input.url}` });
  }

  const significantCount = tracked.diffs.filter((d) => d.isLegallySignificant).length;

  const timeline = tracked.diffs.map((d) => ({
    id: d.id,
    beforeDate: d.beforeDate,
    afterDate: d.afterDate,
    snapshotUrl: d.snapshotUrl,
    deletedItems: parseJsonArray(d.deletedText),
    addedItems: parseJsonArray(d.addedText),
    aiSignificance: d.aiSignificance,
    isLegallySignificant: d.isLegallySignificant,
    // LEVEL 5. Rendered from the same helper the REST surfaces use, because a
    // defect visible only through REST is unfindable from the research
    // interface — and the researcher decides here, not there.
    survival: diffSurvivalView(d),
    // WHAT THE CLASSIFIER READ, beside what the row now holds. `survival` above
    // says whether the change is real; this says whether the description of it
    // was written about the text still stored here.
    classificationInput: classificationInputView(d),
  }));

  // Derived from state on every read, never tracked through a write.
  //
  // Snapshot anchoring is fire-and-forget with a swallowed rejection — correctly,
  // since a chain hiccup must not fail a scan that stored archived text. But
  // nothing ever asked afterwards, and a scan that ran while the RPC was down
  // left all 83 snapshots unanchored while reporting success. A counter
  // incremented at write time would have reported zero failures; this cannot.
  const [snapshotsStored, unanchoredSnapshots] = await Promise.all([
    prisma.urlSnapshot.count({ where: { trackedUrlId: tracked.id } }),
    prisma.urlSnapshot.count({ where: { trackedUrlId: tracked.id, onChainTxHash: null } }),
  ]);

  // LEVEL 5, IN THE SUMMARY AND NOT ONLY PER ROW.
  //
  // A per-diff field that nothing aggregates is a field a reader skims past —
  // this repository has recorded six occasions where the mechanism was right and
  // the summary was what people acted on. `anchoringWarning` above is the same
  // pattern, and these counts are read from the SAME view helper the rows use, so
  // the headline and the detail cannot disagree.
  const staleClassifications = timeline.filter(
    (d) => d.classificationInput.state === 'STALE',
  ).length;

  const survivalStates = timeline.map((d) => d.survival.state);
  const contradictedDiffs = survivalStates.filter((v) => v === 'CONTRADICTED').length;
  const uncheckedDiffs = survivalStates.filter(
    (v) => v === 'UNCHECKED' || v === 'STALE',
  ).length;

  return JSON.stringify({
    url: tracked.url,
    title: tracked.title,
    status: tracked.status,
    totalDiffs: tracked.diffs.length,
    significantDiffs: significantCount,
    // Never folded into one number. A diff nobody has checked and a diff the
    // documents refute are different problems with different remedies, and the
    // second is never promotable.
    contradictedDiffs,
    uncheckedDiffs,
    staleClassifications,
    ...(contradictedDiffs > 0
      ? {
          survivalWarning:
            `${String(contradictedDiffs)} of ${String(tracked.diffs.length)} diffs are CONTRADICTED: the archived ` +
            'documents refute a change the platform reports. A chunk said to be REMOVED is still ' +
            'present in the after capture, or one said to be ADDED was already in the before one. ' +
            'These record a defect in the pipeline, not a change to the page, and must not back ' +
            'evidence. Inspect with get_diff_input; measure with npm run forensics:measure-divergence.',
        }
      : {}),
    ...(staleClassifications > 0
      ? {
          classificationWarning:
            `${String(staleClassifications)} of ${String(tracked.diffs.length)} diffs carry a classification made from ` +
            'chunks that have since been recomputed. Their stored items describe text the row no ' +
            'longer holds — a v4 classification over v3 chunks, when the v4 run read v2 chunks ' +
            'that no longer exist. This is a PROVENANCE fact, not a repair instruction: ' +
            'reclassifying changes what the record says about the ministry\'s edit, which is the ' +
            "researcher's decision. Inspect with get_diff_input.",
        }
      : {}),
    ...(uncheckedDiffs > 0
      ? {
          uncheckedWarning:
            `${String(uncheckedDiffs)} of ${String(tracked.diffs.length)} diffs carry no current Level 5 verdict. ` +
            'UNCHECKED IS NOT A PASS — nothing has compared these reported changes against the ' +
            'documents they span. Repair with npm run forensics:backfill-survival, then verify ' +
            'with npm run forensics:audit-survival.',
        }
      : {}),
    snapshotsStored,
    // The factual layer's chain of custody. Non-zero means the archived text for
    // this page is stored but its hash was never published, so "this page held
    // exactly this text on this date" currently rests on this platform's word.
    unanchoredSnapshots,
    ...(unanchoredSnapshots > 0
      ? {
          anchoringWarning:
            `${unanchoredSnapshots} of ${snapshotsStored} archived snapshots for this page are not ` +
            'registered on-chain. Evidence promoted from them is still anchored in its own right, ' +
            'but the underlying capture is not independently timestamped. Repair with ' +
            'npm run forensics:anchor-snapshots.',
        }
      : {}),
    timeline,
  });
}

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
