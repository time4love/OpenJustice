import { CalibrationDecisionType } from '@prisma/client';

/**
 * The calibration log's folds — episodes, streaks, and ERAS.
 *
 * ITS OWN MODULE, AND PURE. `calibrationRun.ts` reaches the database and
 * `chromeRulesetApply` reaches jsdom; neither belongs in a function whose whole
 * content is "what does this list of decisions mean". Keeping the folds here is
 * what lets them be tested against a literal array rather than a mocked client,
 * and it is the same split `runCoverage.ts` was made for.
 *
 * THE STRUCTURAL DECISION TYPE IS DELIBERATE. These folds need three fields and
 * Prisma's row carries a dozen; taking the narrow type means a test states the
 * case it is testing instead of constructing a database row to express it.
 */

/** The three fields every fold here reads. Prisma's row satisfies it structurally. */
export interface FoldableDecision {
  type: CalibrationDecisionType;
  selectors: string[];
  snapshotId: string | null;
}

/**
 * One capture's episode: what was shown, and what the human then did about it.
 *
 * An episode opens at each CAPTURE_SHOWN and runs to the next one. `dirty` says
 * the rules were corrected inside it. `judged` says a HUMAN ACTED on it — which
 * showing it is not, and which is the whole distinction the old fold collapsed.
 */
export interface Episode {
  dirty: boolean;
  judged: boolean;
  /** The capture could not be used. Says nothing about the rules, either way. */
  skipped: boolean;
}

/**
 * The run's episodes, in order.
 *
 * THREE EVENTS ARE JUDGEMENTS AND ONE IS NOT. Accepting says the rules are
 * right here; rejecting says they are wrong here; correcting says so too, by
 * doing something about it — the plan is explicit that a rejection means the
 * RULES are wrong rather than that the capture is bad, and routes back to
 * marking. Skipping is the exception: it declares the capture unusable, so the
 * episode is neither clean nor dirty and is excluded from every denominator
 * rather than counted as agreement.
 */
export function foldEpisodes(decisions: readonly FoldableDecision[]): Episode[] {
  const episodes: Episode[] = [];
  const current = (): Episode | undefined => episodes.at(-1);

  for (const decision of decisions) {
    switch (decision.type) {
      case CalibrationDecisionType.CAPTURE_SHOWN:
        // Opened, and NOT yet clean. The old fold pushed `true` here, which is
        // how a render became a verdict.
        episodes.push({ dirty: false, judged: false, skipped: false });
        break;
      case CalibrationDecisionType.RULESET_CORRECTED: {
        const episode = current();
        if (episode) {
          episode.dirty = true;
          episode.judged = true;
        }
        break;
      }
      case CalibrationDecisionType.CAPTURE_REJECTED: {
        // A rejection is a verdict against the RULES on its own, whether or not
        // a correction has landed yet.
        const episode = current();
        if (episode) {
          episode.dirty = true;
          episode.judged = true;
        }
        break;
      }
      case CalibrationDecisionType.CAPTURE_ACCEPTED: {
        const episode = current();
        if (episode) episode.judged = true;
        break;
      }
      case CalibrationDecisionType.CAPTURE_SKIPPED: {
        const episode = current();
        if (episode) episode.skipped = true;
        break;
      }
      default:
        break;
    }
  }
  return episodes;
}

/** The episodes that say something about the rules. Every denominator's input. */
export function judgedEpisodes(episodes: readonly Episode[]): Episode[] {
  return episodes.filter((e) => e.judged && !e.skipped);
}

/**
 * Judged captures at the end of the run, in a row, that needed no correction.
 *
 * Computed over JUDGED episodes only, so a capture currently on screen and not
 * yet decided neither extends the streak nor breaks it. Both directions are
 * errors: counting it clean is the defect this replaces, and counting it dirty
 * would zero the streak every time the next capture loaded.
 */
export function trailingClean(episodes: readonly Episode[]): number {
  const judged = judgedEpisodes(episodes);
  let count = 0;
  for (let i = judged.length - 1; i >= 0; i -= 1) {
    if (judged.at(i)?.dirty !== false) break;
    count += 1;
  }
  return count;
}

/**
 * How many judged captures in a row, needing no correction, confirm an era.
 *
 * ONE IMPORTABLE SYMBOL, because until now the number lived only inside a
 * SENTENCE — `"the stopping rule asks for three"` — where nothing could enforce
 * it and nothing could disagree with it. The streak was reported and never
 * acted on; under era scoping it decides when a ruleset stops asking a human,
 * which is not a claim a string should carry.
 *
 * OPEN IN THE PLAN: whether the count that CONFIRMS an era and the count that
 * enables automatic mode are the same number. They are one here, and a second
 * constant must not be introduced without that being decided.
 */
export const CONFIRM_AFTER_CLEAN = 3;

/**
 * One era: a stretch of the timeline over which a single ruleset is asserted.
 *
 * DERIVED, NEVER STORED. The plan's Level 4 is explicit that there is no era
 * table — no range columns and no status flag — because every field below is a
 * question the log already answers, and a stored status is a claim about history
 * that can disagree with the history.
 */
export interface Era {
  /** 0-based, in time order. */
  index: number;
  /**
   * The capture the researcher named as this era's first.
   *
   * NULL FOR THE FIRST ERA, which extends backwards: there was no redesign
   * before the earliest capture, so the era that covers it has no start to name.
   */
  startsAtSnapshotId: string | null;
  /** The rules in force at the end of this era's segment — the fold's usual rule. */
  selectors: readonly string[];
  /** Judged captures at the end of this era, in a row, that needed no correction. */
  trailingClean: number;
  /**
   * The era's rules are settled.
   *
   * FROZEN IS THE SAME PREDICATE, not a second flag. The plan: an approved era's
   * ruleset is frozen and its captures are never re-derived, so there is nothing
   * for a separate `frozen` field to say that this one does not.
   */
  confirmed: boolean;
}

/**
 * Split the log into eras and fold each one.
 *
 * AN `ERA_BOUNDARY` OPENS THE ERA IT NAMES rather than closing the one before.
 * The researcher answers "redesign" while looking at a capture, and the answer
 * is about THAT capture: it is the first one the old rules do not describe. So
 * the boundary decision belongs to the new segment, and the era it starts is the
 * era that capture is in.
 *
 * WHAT THE NEW ERA'S RULES START AS IS NOT THIS FUNCTION'S BUSINESS. It reads
 * the selectors the log records, so seeding a new era from the previous one and
 * starting it empty are both expressible and neither is assumed here. That
 * choice belongs to the tool that writes the boundary, and the plan has not made
 * it.
 */
export function deriveEras(
  decisions: readonly FoldableDecision[],
  confirmAfter: number = CONFIRM_AFTER_CLEAN,
): Era[] {
  const segments: { startsAt: string | null; decisions: FoldableDecision[] }[] = [
    { startsAt: null, decisions: [] },
  ];

  for (const decision of decisions) {
    if (decision.type === CalibrationDecisionType.ERA_BOUNDARY) {
      segments.push({ startsAt: decision.snapshotId, decisions: [decision] });
    } else {
      segments.at(-1)?.decisions.push(decision);
    }
  }

  return segments.map((segment, index) => {
    const clean = trailingClean(foldEpisodes(segment.decisions));
    return {
      index,
      startsAtSnapshotId: segment.startsAt,
      // `.at(-1)` rather than an indexed read: the two debt ratchets rule out
      // both spellings of `xs[n]` between them.
      selectors: segment.decisions.at(-1)?.selectors ?? [],
      trailingClean: clean,
      confirmed: clean >= confirmAfter,
    };
  });
}

/** An era with its start resolved to a date, which the log alone cannot supply. */
export interface DatedEra extends Era {
  /** `null` on the first era, which extends backwards to the start of time. */
  startDate: string | null;
}

/**
 * Which era's rules apply to a capture taken on this date.
 *
 * THE LATEST ERA THAT HAD STARTED BY THEN. This is the whole of era selection:
 * no classifier, no judgement, and no way for two eras to claim one capture —
 * which was the standing objection to era scoping and does not survive contact
 * with a date range.
 *
 * Eras are assumed in time order, which `deriveEras` produces because the log is
 * ordered by sequence and a boundary is always appended after the captures it
 * follows.
 *
 * GENERIC OVER THE ERA, because two callers need it and they carry different
 * fields: the run view wants the whole `Era`, and governance wants selectors and
 * a date and must NOT be handed a `confirmed` flag folded from a filtered log,
 * where it would not mean what it says. One implementation either way.
 */
export function eraForDate<T extends { startDate: string | null }>(
  eras: readonly T[],
  date: string,
): T | null {
  let selected: T | null = null;
  for (const era of eras) {
    if (era.startDate === null || era.startDate <= date) selected = era;
    else break;
  }
  return selected;
}


/** A selector, and the capture it was introduced against. */
export interface SelectorAnchor {
  snapshotId: string | null;
  /** `null` when the capture's date is unknown, or the decision named none. */
  date: string | null;
}

/**
 * WHICH CAPTURE EACH SELECTOR WAS MARKED AGAINST — the only one it was ever
 * checked on.
 *
 * That capture's DATE is what scopes every later question about the selector:
 * which earlier captures it could damage, where one era ends, and — under
 * date-scoped application — whether it runs against a given capture at all.
 *
 * RECOVERED FOR DECISIONS WRITTEN BEFORE CORRECTIONS CARRIED A CAPTURE.
 * `RULESET_CORRECTED` was FORBIDDEN to name one until 2026-09-01, so every
 * selector recorded before that has no anchor of its own.
 *
 * THE RECOVERY LOOKS BACKWARD, TO THE LAST CAPTURE SHOWN, because a correction is
 * made while a capture is on screen. That is exact for both writers: the browser
 * shows a capture and then autosaves against it, and `open_article_capture`
 * records the showing before a draft is promoted.
 *
 * AN EARLIER VERSION LOOKED FORWARD — to the next decision naming a capture —
 * which was true of the judging tool and FALSE of the browser, where many
 * corrections sat between one verdict and the next. It stamped December 2020
 * selectors with a March 2025 date and produced three alerts naming the wrong
 * rules. RECOVERED ANCHORS ARE THEREFORE NOT TRUSTWORTHY for runs predating the
 * fix, and a caller relying on them should say so.
 */
export function selectorAnchors(
  decisions: readonly FoldableDecision[],
  dateOf: ReadonlyMap<string, string>,
): Map<string, SelectorAnchor> {
  const anchors = new Map<string, SelectorAnchor>();
  let lastShown: string | null = null;
  for (const decision of decisions) {
    if (decision.type === CalibrationDecisionType.CAPTURE_SHOWN && decision.snapshotId !== null) {
      lastShown = decision.snapshotId;
    }
    // A correction naming its own capture is authoritative; the fallback exists
    // only for the ones written before they could.
    const named = decision.snapshotId ?? lastShown;
    for (const selector of decision.selectors) {
      if (anchors.has(selector)) continue;
      anchors.set(selector, {
        snapshotId: named,
        date: named === null ? null : (dateOf.get(named) ?? null),
      });
    }
  }
  return anchors;
}

/**
 * The selectors that apply to a capture on this date — those anchored at or
 * before it.
 *
 * THE RESEARCHER'S PROPOSAL, and it makes backwards harm STRUCTURALLY IMPOSSIBLE
 * rather than merely unobserved: a rule marked on a 2022 page never runs against a
 * 2020 one, so it cannot remove anything from it. Per selector, not per era.
 *
 * AN UNANCHORED SELECTOR APPLIES. Its anchor is missing rather than late, and
 * excluding it would silently drop rules from runs recorded before anchors were
 * kept — turning missing provenance into missing filtering.
 *
 * IT FILTERS BACKWARDS AND NOT FORWARDS: a 2022 capture still receives every
 * selector anchored before it, including ones whose structure is long gone. Those
 * match nothing and remove nothing, but they DILUTE a match rate, which is why a
 * ratio-based detector degrades over time under this model and a
 * segment-comparison one does not.
 */
export function selectorsForDate(
  selectors: readonly string[],
  anchors: ReadonlyMap<string, SelectorAnchor>,
  date: string,
): string[] {
  return selectors.filter((selector) => {
    const anchored = anchors.get(selector)?.date;
    return anchored === undefined || anchored === null || anchored <= date;
  });
}
