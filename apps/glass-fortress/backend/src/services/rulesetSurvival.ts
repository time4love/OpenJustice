import { prisma } from '../lib/prisma';
import { CalibrationDecisionType } from '@prisma/client';
import { deriveTextUnderRuleset } from '../lib/chromeRulesetApply';
import { compareKeptText, attributeRemoval } from '../lib/claimSurvival';
import { readCalibrationRun } from './calibrationRun';

/**
 * Re-derive every capture in a run under the ruleset in force now, and report
 * what any of them stopped keeping.
 *
 * WHY THIS EXISTS. A calibration ruleset is the UNION of every era it has met:
 * marking a 2022 capture adds selectors a 2020 capture never needed. That is
 * free for an IDENTITY-BEARING selector — one that does not apply matches
 * nothing and removes nothing. It is not free for a POSITIONAL one.
 * `article.common-item > div:nth-of-type(1)` names a place rather than a thing,
 * and a redesign can move article text into that place.
 *
 * THE HARM IS RETROACTIVE, WHICH IS WHY NOTHING CAUGHT IT. Marking looks
 * forward: the researcher reads the text removed from the capture IN FRONT OF
 * THEM. A selector added for a 2022 page that damages a 2020 page lands where
 * nobody is looking. This is the pass that looks back.
 *
 * EVERY CAPTURE, NOT ONLY THE ACCEPTED ONES — the researcher's correction to a
 * first draft that checked acceptances alone. `commit_article_rules` re-derives
 * EVERY stored capture, so damage to an unjudged one enters the corpus just as
 * silently; it simply breaks no approval on the way in.
 *
 * A SELECTOR'S ANCHOR IS WHAT SCOPES THE RECHECK. Each selector is anchored to
 * the capture that was on screen when it was added, which the decision log
 * already records. For a given capture, the selectors that could not have been
 * checked against it are those anchored to a LATER snapshot — "rules from its
 * future" — plus, if it was accepted, anything added since that acceptance.
 * Those are the suspects, and the baseline is the ruleset without them.
 */

/** A selector, and the capture it was introduced for. */
interface Anchor {
  snapshotId: string | null;
  date: string | null;
}

export interface CaptureSurvival {
  snapshotId: string;
  snapshotDate: string;
  /** The capture's extraction was approved, and this loss breaks that approval. */
  wasAccepted: boolean;
  survived: boolean;
  noLongerKept: readonly string[];
  noLongerKeptChars: number;
  keptCharsBaseline: number;
  keptCharsNow: number;
  /**
   * Selectors that could not have been checked against this capture — anchored
   * to a later snapshot, or added after this capture was accepted.
   */
  suspectSelectors: readonly { selector: string; anchoredTo: string | null }[];
  /** Which suspect could account for each segment. A hint; subtrees overlap. */
  attributedTo: readonly { selector: string; segments: readonly string[] }[];
}

export interface RulesetSurvivalReport {
  runId: string;
  selectorsNow: number;
  capturesChecked: number;
  intact: number;
  /**
   * Captures that have lost text. NON-ZERO IS A FINDING: each is a capture whose
   * text a later rule changed without that rule ever being checked against it.
   */
  alerts: number;
  /** Alerts on captures whose extraction had been APPROVED. The worse half. */
  brokenApprovals: number;
  captures: readonly CaptureSurvival[];
}

export async function checkRulesetSurvival(runId: string): Promise<RulesetSurvivalReport> {
  const run = await readCalibrationRun(runId);
  const current = run.selectors;

  const decisions = await prisma.calibrationDecision.findMany({
    where: { calibrationRunId: runId },
    orderBy: { sequence: 'asc' },
    select: { snapshotId: true, selectors: true, type: true },
  });

  // EVERY STORED CAPTURE, NOT THE SAMPLE. `commit_article_rules` re-derives all
  // of them, so a capture outside the sample enters the corpus under these rules
  // exactly as one inside it does — and a check scoped to the sample would report
  // safety it had not looked for. Documents are loaded one at a time below rather
  // than in this query, which holds the bytes of one capture rather than all.
  const all = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: run.trackedUrlId },
    select: { id: true, snapshotDate: true },
    orderBy: { capturedAt: 'asc' },
  });
  const dates = new Map(all.map((snapshot) => [snapshot.id, snapshot.snapshotDate]));

  // WHERE EACH SELECTOR CAME FROM. First appearance wins: a selector present in
  // several later decisions was introduced once, and the capture on screen then
  // is the only one it was ever checked against.
  const anchors = new Map<string, Anchor>();
  for (const decision of decisions) {
    for (const selector of decision.selectors) {
      if (anchors.has(selector)) continue;
      anchors.set(selector, {
        snapshotId: decision.snapshotId,
        date: decision.snapshotId === null ? null : (dates.get(decision.snapshotId) ?? null),
      });
    }
  }

  // The ruleset each accepted capture was approved under, newest acceptance
  // winning: a capture re-judged after a correction was approved under the LATER
  // ruleset, and comparing against the earlier one would report a change the
  // researcher has already looked at and agreed to.
  const acceptedUnder = new Map<string, string[]>();
  for (const decision of decisions) {
    if (decision.type === CalibrationDecisionType.CAPTURE_ACCEPTED && decision.snapshotId !== null) {
      acceptedUnder.set(decision.snapshotId, decision.selectors);
    }
  }

  const captures: CaptureSurvival[] = [];
  for (const row of all) {
    const snapshotId = row.id;
    const snapshot = await prisma.urlSnapshot.findUnique({
      where: { id: snapshotId },
      select: { document: true, documentContentType: true, documentContentEncoding: true },
    });
    if (!snapshot) continue;

    const captureDate = row.snapshotDate;
    const approvedUnder = acceptedUnder.get(snapshotId);

    const suspects = current.filter((selector) => {
      const anchor = anchors.get(selector);
      // An unanchored selector predates the log's record of it; treat it as
      // original rather than suspect, since inventing suspicion would alert on
      // every capture forever.
      if (!anchor) return false;
      // `snapshotDate` is non-nullable on the capture; only an ANCHOR can lack a
      // date, when the decision that introduced the selector named no capture.
      const fromItsFuture = anchor.date !== null && anchor.date > captureDate;
      const addedSinceApproval = approvedUnder !== undefined && !approvedUnder.includes(selector);
      return fromItsFuture || addedSinceApproval;
    });

    const derive = (selectors: readonly string[]) =>
      deriveTextUnderRuleset(
        snapshot.document,
        snapshot.documentContentType,
        snapshot.documentContentEncoding,
        { selectors: [...selectors] },
      );

    const baseline = derive(current.filter((selector) => !suspects.includes(selector)));
    const now = derive(current);
    const comparison = compareKeptText(baseline.text, now.text);

    captures.push({
      snapshotId,
      snapshotDate: captureDate,
      wasAccepted: approvedUnder !== undefined,
      survived: comparison.survived,
      noLongerKept: comparison.noLongerKept,
      noLongerKeptChars: comparison.noLongerKeptChars,
      keptCharsBaseline: comparison.keptCharsBefore,
      keptCharsNow: comparison.keptCharsAfter,
      suspectSelectors: suspects.map((selector) => ({
        selector,
        anchoredTo: anchors.get(selector)?.date ?? null,
      })),
      attributedTo: attributeRemoval(comparison.noLongerKept, now.chrome.removedSegments, suspects),
    });
  }

  const alerts = captures.filter((capture) => !capture.survived);
  return {
    runId,
    selectorsNow: current.length,
    capturesChecked: captures.length,
    intact: captures.length - alerts.length,
    alerts: alerts.length,
    brokenApprovals: alerts.filter((capture) => capture.wasAccepted).length,
    captures,
  };
}
