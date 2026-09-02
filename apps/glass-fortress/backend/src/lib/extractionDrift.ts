/**
 * DID A SEGMENT CHANGE SIDES BETWEEN TWO CAPTURES?
 *
 * The researcher's signal, and it is sharper than the ones it joins:
 *
 *   text KEPT by the previous capture, REMOVED by this one   → a rule ate article text
 *   text REMOVED by the previous capture, KEPT by this one   → furniture stopped being removed
 *
 * WHY "CHANGED SIDES" AND NOT "DIFFERS". Consecutive captures of a news page differ
 * enormously and legitimately — a rotating sidebar, a moving ticker, accumulating
 * comments — so a raw text diff is noise. An EDITORIAL EDIT makes the text absent
 * from the later capture ALTOGETHER. Only a rule failure leaves it present in the
 * document and on the other side of the line. That is the discrimination, and it
 * is what makes these usable unattended.
 *
 * NO BASELINE, WHICH IS THE POINT. The over-match detector in `eraDetectors`
 * compares kept-text length against an era norm: it needs three clean captures
 * before it says anything, and it has never been tried against a real over-match,
 * so its false-negative rate is unbounded. This needs only the PREVIOUS capture,
 * works from the second one onward, and names the actual text — so it can be
 * tested by constructing an over-match rather than waiting for one.
 *
 * IT IS NOT A RATIO, so it does not care how large the ruleset is. A match rate
 * over a union is diluted by selectors that can never match this page; this is
 * not, which is why it works under either model.
 *
 * SET SEMANTICS, DELIBERATELY, unlike `claimSurvival`'s multiset. That check asks
 * "did something disappear", where a count matters. This asks "did this text move
 * sides" — a partial move is still a move and still worth a human's attention.
 */
import { segments } from './claimSurvival';

/** A segment that moved, with the selector that now removes it where one is known. */
export interface DriftedSegment {
  text: string;
  /**
   * Which selector removes it now. A HINT, not a verdict: subtrees overlap, so a
   * segment can be claimed by more than one, and the researcher still looks.
   */
  selector: string | null;
}

export interface ExtractionDrift {
  /**
   * Kept before, removed now. THE DANGEROUS DIRECTION — a selector has started
   * taking article text, and nothing else in this system sees it directly.
   */
  nowRemoved: readonly DriftedSegment[];
  /**
   * Removed before, kept now. Furniture leaking back into the text, which is what
   * a ruleset that has stopped applying looks like.
   */
  nowKept: readonly string[];
  nowRemovedChars: number;
  nowKeptChars: number;
  /** Nothing changed sides. NOT "the captures are the same". */
  quiet: boolean;
}

export interface CaptureExtraction {
  keptText: string;
  removedText: string;
}

export interface CurrentExtraction extends CaptureExtraction {
  /** Attributed removals, so a drifted segment can name the rule that took it. */
  removedSegments: readonly { selector: string; text: string }[];
}

function attribute(
  text: string,
  removedSegments: readonly { selector: string; text: string }[],
): string | null {
  const normalised = (value: string) => value.replace(/\s+/g, ' ');
  return (
    removedSegments.find((removed) => normalised(removed.text).includes(text))?.selector ?? null
  );
}

/**
 * Compare two consecutive captures' extractions.
 *
 * `previous` is the capture before this one IN TIME — under whatever rules were in
 * force then. Across an era boundary that is a different ruleset, and the
 * comparison firing there is correct: it is exactly the moment the rules stopped
 * describing the page.
 */
export function compareExtractions(
  previous: CaptureExtraction,
  current: CurrentExtraction,
): ExtractionDrift {
  const previousKept = new Set(segments(previous.keptText));
  const previousRemoved = new Set(segments(previous.removedText));
  const currentKept = new Set(segments(current.keptText));
  const currentRemovedList = segments(current.removedText);

  // KEPT → REMOVED. The segment is still in this capture's document, so an
  // editorial deletion cannot produce it: that would leave the text in neither.
  const nowRemoved = currentRemovedList
    .filter((segment) => previousKept.has(segment))
    .map((text) => ({ text, selector: attribute(text, current.removedSegments) }));

  // REMOVED → KEPT. Same argument in the other direction: furniture that vanished
  // from the page entirely is in neither, and does not fire.
  const nowKept = [...currentKept].filter((segment) => previousRemoved.has(segment));

  const chars = (values: readonly string[]) =>
    values.reduce((total, value) => total + value.length, 0);
  const nowRemovedChars = chars(nowRemoved.map((segment) => segment.text));
  const nowKeptChars = chars(nowKept);

  return {
    nowRemoved,
    nowKept,
    nowRemovedChars,
    nowKeptChars,
    quiet: nowRemoved.length === 0 && nowKept.length === 0,
  };
}
