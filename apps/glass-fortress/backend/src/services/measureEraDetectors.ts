import { prisma } from '../lib/prisma';
import { deriveTextUnderRuleset } from '../lib/chromeRulesetApply';
import { matchRate, type CaptureReading } from '../lib/eraDetectors';

/**
 * WHAT THE TWO DETECTORS ACTUALLY SEE, measured across a page's whole timeline.
 *
 * The thresholds are the gate on automatic mode and nothing may supply them until
 * they are measured — one page currently gives 19→5 across a boundary and 16 of
 * 19 within one, which is a data point and not a threshold. This is the
 * instrument that turns it into a distribution.
 *
 * IT MEASURES ONE SELECTOR SET AGAINST EVERY CAPTURE. That is deliberate and it
 * is the comparison that matters: run it at an EARLY version to see a ruleset
 * meet a redesign it was never marked against, and at the newest to see what the
 * UNION does to the same signal. The union is expected to mask the boundary —
 * that is why it was superseded — and an instrument that could only measure the
 * union could not show it.
 *
 * READ-ONLY. It parses documents already held and writes nothing.
 */

export interface CaptureMeasurement extends CaptureReading {
  snapshotId: string;
  snapshotDate: string;
  matchRate: number;
}

export interface EraDetectorMeasurement {
  runId: string;
  trackedUrlId: string;
  url: string;
  /** The decision sequence whose selectors were measured. */
  version: number;
  selectors: readonly string[];
  captures: readonly CaptureMeasurement[];
}

/**
 * The selectors as of a version — the newest decision at or before it.
 *
 * The log stores each decision's FULL selector set, so this is a lookup rather
 * than a replay: "the rules in force after decision N" is decision N's own list.
 */
async function selectorsAtVersion(
  runId: string,
  version: number | undefined,
): Promise<{ selectors: string[]; version: number } | null> {
  const decision = await prisma.calibrationDecision.findFirst({
    where: { calibrationRunId: runId, ...(version === undefined ? {} : { sequence: { lte: version } }) },
    orderBy: { sequence: 'desc' },
    select: { selectors: true, sequence: true },
  });
  return decision === null ? null : { selectors: decision.selectors, version: decision.sequence };
}

export async function measureEraDetectors(
  runId: string,
  version?: number,
): Promise<EraDetectorMeasurement | null> {
  const run = await prisma.calibrationRun.findUnique({
    where: { id: runId },
    select: { trackedUrlId: true, trackedUrl: { select: { url: true } } },
  });
  if (run === null) return null;

  const at = await selectorsAtVersion(runId, version);
  if (at === null) return null;

  const snapshots = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: run.trackedUrlId },
    orderBy: { capturedAt: 'asc' },
    select: {
      id: true,
      snapshotDate: true,
      document: true,
      documentContentType: true,
      documentContentEncoding: true,
    },
  });

  const captures = snapshots.map((snapshot) => {
    const derived = deriveTextUnderRuleset(
      snapshot.document,
      snapshot.documentContentType,
      snapshot.documentContentEncoding,
      { selectors: at.selectors },
    );
    // COUNTED AS "MATCHED AT LEAST ONE NODE", the same rule the detector uses: a
    // selector matching thirty rotating adverts and one matching a footer are
    // equally still applying.
    const matchedSelectors = at.selectors.filter(
      (selector) => (derived.chrome.matchCounts[selector] ?? 0) > 0,
    ).length;
    const reading: CaptureReading = {
      matchedSelectors,
      totalSelectors: at.selectors.length,
      keptTextLength: derived.text.length,
    };
    return {
      ...reading,
      snapshotId: snapshot.id,
      snapshotDate: snapshot.snapshotDate,
      matchRate: matchRate(reading),
    };
  });

  return {
    runId,
    trackedUrlId: run.trackedUrlId,
    url: run.trackedUrl.url,
    version: at.version,
    selectors: at.selectors,
    captures,
  };
}
