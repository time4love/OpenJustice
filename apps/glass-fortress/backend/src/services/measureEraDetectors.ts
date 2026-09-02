import { prisma } from '../lib/prisma';
import { deriveTextUnderRuleset } from '../lib/chromeRulesetApply';
import { matchRate, type CaptureReading } from '../lib/eraDetectors';
import { selectorAnchors, selectorsForDate } from '../lib/calibrationFold';

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
  /**
   * The same capture under DATE-SCOPED application: only selectors anchored at or
   * before its date. Absent when the run holds no anchors to scope by.
   */
  scoped?: CaptureReading & { matchRate: number; selectors: number };
}

export interface EraDetectorMeasurement {
  runId: string;
  /**
   * How many selectors carry a usable anchor date.
   *
   * REPORTED BESIDE THE SCOPED NUMBERS BECAUSE THEY DEPEND ON IT. Anchors
   * recovered for decisions written before corrections carried a capture are NOT
   * trustworthy, so a scoped measurement over mostly-unanchored selectors
   * measures the recovery rather than the design.
   */
  anchoredSelectors: number;
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

/**
 * The newest calibration run for a URL.
 *
 * BY URL, BECAUSE THAT IS WHAT A RESEARCHER HOLDS. Reaching a run id otherwise
 * means calling `correct_article_rules`, which ALWAYS OPENS A NEW RUN — a write,
 * and a fragmented record — merely to learn an identifier. A measurement must not
 * cost the corpus a row.
 */
export async function newestRunForUrl(url: string): Promise<string | null> {
  const run = await prisma.calibrationRun.findFirst({
    where: { trackedUrl: { url } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return run?.id ?? null;
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

  // Anchors need the whole log, not just the version being measured: a selector's
  // anchor is where it FIRST appeared, which may precede `--version`.
  const allDecisions = await prisma.calibrationDecision.findMany({
    where: { calibrationRunId: runId },
    orderBy: { sequence: 'asc' },
    select: { snapshotId: true, selectors: true, type: true },
  });

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

  const dates = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot.snapshotDate]));
  const anchors = selectorAnchors(allDecisions, dates);
  const anchoredSelectors = at.selectors.filter((selector) => anchors.get(selector)?.date != null).length;

  const read = (selectors: readonly string[], derived: { text: string; chrome: { matchCounts: Record<string, number> } }) => {
    const matchedSelectors = selectors.filter(
      (selector) => (derived.chrome.matchCounts[selector] ?? 0) > 0,
    ).length;
    return { matchedSelectors, totalSelectors: selectors.length, keptTextLength: derived.text.length };
  };

  const captures = snapshots.map((snapshot) => {
    const derive = (selectors: readonly string[]) =>
      deriveTextUnderRuleset(
        snapshot.document,
        snapshot.documentContentType,
        snapshot.documentContentEncoding,
        { selectors: [...selectors] },
      );

    // COUNTED AS "MATCHED AT LEAST ONE NODE", the same rule the detector uses: a
    // selector matching thirty rotating adverts and one matching a footer are
    // equally still applying.
    const reading = read(at.selectors, derive(at.selectors));

    // THE SAME CAPTURE UNDER DATE-SCOPED APPLICATION. Derived separately rather
    // than filtered from the union's counts, because the removal itself changes:
    // a selector excluded by its anchor removes nothing, so the KEPT TEXT differs
    // and a filtered count would report the union's extraction under a smaller
    // denominator.
    const scopedSelectors = selectorsForDate(at.selectors, anchors, snapshot.snapshotDate);
    const scopedReading = read(scopedSelectors, derive(scopedSelectors));

    return {
      ...reading,
      snapshotId: snapshot.id,
      snapshotDate: snapshot.snapshotDate,
      matchRate: matchRate(reading),
      scoped: { ...scopedReading, matchRate: matchRate(scopedReading), selectors: scopedSelectors.length },
    };
  });

  return {
    runId,
    anchoredSelectors,
    trackedUrlId: run.trackedUrlId,
    url: run.trackedUrl.url,
    version: at.version,
    selectors: at.selectors,
    captures,
  };
}
