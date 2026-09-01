/**
 * Did text that a ruleset KEPT disappear when the ruleset grew?
 *
 * THE UNION RULESET'S ONE RISK, MADE CHECKABLE. A calibration run accumulates
 * selectors across eras: a capture from 2022 needs marks that a capture from
 * 2020 never had, and both sets live in one ruleset. A selector that is merely
 * IRRELEVANT to a capture costs nothing — it matches nothing and removes
 * nothing. A selector that is WRONG for a capture removes that capture's article
 * text, and nothing in the marking flow would show it: the researcher reads the
 * removed text of the capture IN FRONT OF THEM, while the damage lands on a
 * capture accepted weeks earlier that nothing re-renders.
 *
 * The exposure is concentrated in POSITIONAL selectors — `article.common-item >
 * div:nth-of-type(1)` names a place, not a thing, and a redesign can move the
 * lead paragraph into it. An identity-bearing selector that does not apply
 * simply fails to match.
 *
 * SO THE CLAIM IS: no capture accepted under an earlier ruleset loses text under
 * a later one. This compares the two kept texts and reports what vanished. It
 * does NOT judge whether the lost text was article or furniture — that is the
 * researcher's call, and a check that guessed would be a check that hid the
 * question.
 */

export interface SurvivalComparison {
  /** Nothing kept before is missing now. */
  survived: boolean;
  /**
   * Segments the earlier ruleset kept and the later one does not, in the order
   * they appeared. The evidence, not a count of it.
   *
   * NAMED FOR WHAT IT OBSERVES. This function compares two texts and does not
   * know whose they are; the CALLER decides what a difference means. On an
   * ACCEPTED capture the researcher's ruling is that any such segment is lost
   * text and must be alerted — whether or not it was furniture — because an
   * approved extraction that changes without re-approval no longer describes
   * anything. That rule lives with the caller that knows about acceptance.
   */
  noLongerKept: readonly string[];
  noLongerKeptChars: number;
  keptCharsBefore: number;
  keptCharsAfter: number;
}

/**
 * Split into comparable segments.
 *
 * Line-wise and whitespace-normalised, because the extraction's line breaks are
 * stable while its internal spacing is not, and a segment that differs only by a
 * doubled space is not a segment that disappeared.
 */
function segments(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/**
 * Compare kept text before and after a ruleset change.
 *
 * A MULTISET, NOT A SET. A page can legitimately hold the same line twice — a
 * heading repeated in a summary, a date on two items — and if one of the two is
 * removed, a set comparison reports nothing missing because the other still
 * matches. Counting occurrences is what makes a partial loss visible.
 */
export function compareKeptText(before: string, after: string): SurvivalComparison {
  const remaining = new Map<string, number>();
  for (const segment of segments(after)) {
    remaining.set(segment, (remaining.get(segment) ?? 0) + 1);
  }

  const noLongerKept: string[] = [];
  for (const segment of segments(before)) {
    const left = remaining.get(segment) ?? 0;
    if (left > 0) remaining.set(segment, left - 1);
    else noLongerKept.push(segment);
  }

  return {
    survived: noLongerKept.length === 0,
    noLongerKept,
    noLongerKeptChars: noLongerKept.reduce((total, segment) => total + segment.length, 0),
    keptCharsBefore: before.length,
    keptCharsAfter: after.length,
  };
}

/**
 * Which of the added selectors could account for a lost segment.
 *
 * ATTRIBUTION IS A HINT, NOT A VERDICT. Two selectors can remove overlapping
 * subtrees, so a segment may be claimed by more than one and the researcher must
 * still look. Naming the candidates is the difference between "something removed
 * this" and a mark they can undo.
 */
export function attributeRemoval(
  noLongerKept: readonly string[],
  removedSegments: readonly { selector: string; text: string }[],
  addedSelectors: readonly string[],
): readonly { selector: string; segments: readonly string[] }[] {
  const added = new Set(addedSelectors);
  const bySelector = new Map<string, string[]>();

  for (const lost of noLongerKept) {
    for (const removed of removedSegments) {
      if (!added.has(removed.selector)) continue;
      if (!removed.text.replace(/\s+/g, ' ').includes(lost)) continue;
      const existing = bySelector.get(removed.selector);
      if (existing) existing.push(lost);
      else bySelector.set(removed.selector, [lost]);
    }
  }

  return [...bySelector].map(([selector, segs]) => ({ selector, segments: segs }));
}
