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



/**
 * Split into comparable segments.
 *
 * Line-wise and whitespace-normalised, because the extraction's line breaks are
 * stable while its internal spacing is not, and a segment that differs only by a
 * doubled space is not a segment that disappeared.
 *
 * EXPORTED, because `extractionDrift` compares the same kind of text and the two
 * checks must agree about what a segment IS — otherwise a finding from one could
 * not be looked up in the other.
 */
export function segments(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(hasContent);
}

/**
 * A segment carries information only if it contains a LETTER OR A DIGIT.
 *
 * MEASURED, NOT SUPPOSED. On the news page the drift comparison reported 69
 * segments moving from kept to removed, totalling 69 CHARACTERS — sixty-nine
 * single bullets. Walla's extraction emits lines that are just `•`, they drift in
 * and out constantly, and they buried the one real movement in the same run
 * (1,662 characters of furniture returning).
 *
 * A LENGTH THRESHOLD WAS CONSIDERED AND REJECTED as arbitrary: there is no
 * principled shortest meaningful line, and a two-character Hebrew word is content
 * while a twenty-character run of separators is not. "Contains something readable"
 * is the property; length is a proxy for it that would be wrong in both
 * directions.
 *
 * `\p{L}` and `\p{N}` rather than `[a-zA-Z0-9]`, because this corpus is Hebrew.
 */
export function hasContent(line: string): boolean {
  return /[\p{L}\p{N}]/u.test(line);
}
