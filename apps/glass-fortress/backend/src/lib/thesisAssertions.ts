// ---------------------------------------------------------------------------
// Pulling mechanically checkable assertions out of thesis prose.
//
// Deliberately dumb, and deliberately narrow. Everything here is a regex over
// Hebrew and numeric text, with no model anywhere near it — a model judging
// model prose is how a phantom quote survived three rounds of assessment in
// the first real thesis walk.
//
// The cost of that choice is real and is REPORTED rather than hidden: spans
// and counts written in Hebrew number words ("שישה שבועות", "שבעה תצלומים")
// are not reliably extractable, and one of the four errors caught by hand was
// exactly that shape. See UNCHECKABLE_CLASSES, which the audit tool prints in
// its own output. A tool that lists what it cannot see is worth more than one
// that implies completeness.
// ---------------------------------------------------------------------------

/** Hebrew month names, in calendar order — index + 1 is the month number. */
const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
] as const;

// Also seen in practice: מארס for March.
const HEBREW_MONTH_ALIASES: Record<string, number> = {
  מארס: 3,
  אוגוסט: 8,
};

const ISO_SRC = String.raw`\d{4}-\d{2}-\d{2}`;
const NUMERIC_SRC = String.raw`\d{1,2}[./]\d{1,2}[./]\d{4}`;
const HEBREW_SRC = String.raw`\d{1,2}\s+ב(?:${[...HEBREW_MONTHS, 'מארס'].join('|')})\s+\d{4}`;

/** Matches any date shape this module understands. Order matters — ISO first. */
export const DATE_PATTERN_SRC = `(?:${ISO_SRC}|${NUMERIC_SRC}|${HEBREW_SRC})`;

/**
 * Verbs that make a sentence assert an ACT rather than describe a state.
 *
 * "The claim was removed on 05.08.2022" is an assertion the archive usually
 * cannot support, because a capture shows a page's state at an instant, never
 * the moment of an edit. "The claim was absent as of 05.08.2022" is one it can.
 * That distinction is the single most productive check in this set — it caught
 * two of the four errors in the first walk.
 */
const ACT_VERBS = [
  'הוסר', 'הוסרה', 'הוסרו',
  'הורד', 'הורדה', 'הורדו',
  'נמחק', 'נמחקה', 'נמחקו',
  'הושמט', 'הושמטה', 'הושמטו',
  'שונה', 'שונתה', 'שונו',
  'עודכן', 'עודכנה', 'עודכנו',
  'נוסף', 'נוספה', 'נוספו',
  'הוסף', 'הוספה',
  'פורסם', 'פורסמה', 'פורסמו',
  'הוחזר', 'הוחזרה', 'הוחזרו',
  'הושב', 'הושבה',
  'תוקן', 'תוקנה',
  'נערך', 'נערכה',
  'הוכנס', 'הוכנסה',
  'הוסתר', 'הוסתרה',
  'נגרע', 'נגרעה',
];

/**
 * What this module knowingly cannot extract. Printed by audit_thesis_claims in
 * its own result, because a check list that omits its blind spots reads as
 * coverage it does not have.
 */
export const UNCHECKABLE_CLASSES: readonly string[] = [
  'Spans written in Hebrew number words ("שישה שבועות", "כחודשיים") — not extracted, so a wrong ' +
    'span is not detected. One of the four errors in the first thesis walk was exactly this: ' +
    '"six weeks" written for a 31-day interval.',
  'Counts written in Hebrew number words ("שבעה תצלומים", "עשרות שינויים") — not extracted, so a ' +
    'wrong count is not detected.',
  'Paraphrased quotations — only text inside quotation marks is checked against the archive. ' +
    'A claim reworded in the researcher’s own voice is invisible to this tool.',
  'Causation, motive and significance — whether a change MEANS what the thesis says it means is ' +
    'argument, and argument has its own tools (framing session, diff debate, publication rationale).',
  'Anything about a page this platform does not track — captures cannot be listed for it.',
];

/**
 * Split prose into sentences.
 *
 * Splits only on sentence punctuation FOLLOWED BY whitespace, so `05.08.2022`
 * survives intact — the dots inside a numeric date are never followed by a
 * space. Hebrew text from the TipTap extractor arrives with whitespace already
 * collapsed to single spaces, so there is no newline case to handle.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?׃:])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface ParsedDate {
  /** The text exactly as it appears in the thesis. */
  raw: string;
  /** YYYY-MM-DD. */
  iso: string;
  /**
   * True for a numeric date whose day and month are both ≤ 12, where DD.MM and
   * MM.DD cannot be told apart. Israeli convention (DD.MM.YYYY) is assumed and
   * the ambiguity is reported rather than silently resolved.
   */
  dayMonthAmbiguous: boolean;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse one already-matched date string. Returns null when it is not a real date. */
export function parseDate(raw: string): ParsedDate | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const [, y, m, d] = iso;
    if (!isRealDate(+y, +m, +d)) return null;
    return { raw, iso: `${y}-${m}-${d}`, dayMonthAmbiguous: false };
  }

  const numeric = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(raw);
  if (numeric) {
    const [, dd, mm, yyyy] = numeric;
    if (!isRealDate(+yyyy, +mm, +dd)) return null;
    return {
      raw,
      iso: `${yyyy}-${pad(+mm)}-${pad(+dd)}`,
      dayMonthAmbiguous: +dd <= 12 && +mm <= 12 && +dd !== +mm,
    };
  }

  const hebrew = /^(\d{1,2})\s+ב(\S+)\s+(\d{4})$/.exec(raw);
  if (hebrew) {
    const [, dd, monthName, yyyy] = hebrew;
    const idx = HEBREW_MONTHS.indexOf(monthName as (typeof HEBREW_MONTHS)[number]);
    const month = idx >= 0 ? idx + 1 : HEBREW_MONTH_ALIASES[monthName];
    if (!month || !isRealDate(+yyyy, month, +dd)) return null;
    return { raw, iso: `${yyyy}-${pad(month)}-${pad(+dd)}`, dayMonthAmbiguous: false };
  }

  return null;
}

/** Every parseable date in a piece of text, in order of appearance. */
export function extractDates(text: string): ParsedDate[] {
  const pattern = new RegExp(DATE_PATTERN_SRC, 'g');
  const found: ParsedDate[] = [];
  for (const match of text.matchAll(pattern)) {
    const parsed = parseDate(match[0]);
    if (parsed) found.push(parsed);
  }
  return found;
}

/**
 * The act verbs present in a sentence — empty when it describes a state, not an act.
 *
 * Hebrew attaches conjunctions and subordinators as single letters, so "הוסר",
 * "והוסר" and "שהוסר" are the same verb and all three must match. The word
 * boundary is a non-letter on the left and a non-letter on the right, which
 * keeps a verb from matching inside a longer word.
 */
export function actVerbsIn(sentence: string): string[] {
  return ACT_VERBS.filter((verb) =>
    new RegExp(`(?:^|[^\\p{L}])(?:כש|[ושכ])?${verb}(?![\\p{L}])`, 'u').test(sentence),
  );
}

/**
 * Minimum length for a quoted phrase to be worth checking against the archive.
 *
 * Short quotations ("בטוח ויעיל") recur incidentally across unrelated
 * passages, so finding one proves nothing about the specific sentence the
 * thesis attributes it to. Matches the reasoning behind MIN_CLAIM_LENGTH in
 * claim-trajectory detection, at a lower threshold because a quotation the
 * researcher typed deliberately is a stronger signal than a extracted candidate.
 */
export const MIN_QUOTED_LENGTH = 12;

/**
 * Text inside quotation marks.
 *
 * Only the double-quote family — straight, curly, low-9, guillemets and the
 * Hebrew gershayim. Single quotes and apostrophes are excluded deliberately:
 * in Hebrew the geresh is a letter-level mark (ג'ירפה) and treating it as a
 * quotation delimiter produces noise, not findings.
 */
export function extractQuotedPhrases(text: string): string[] {
  const pattern = /"([^"]+)"|“([^”]+)”|„([^”"]+)[”"]|«([^»]+)»|״([^״]+)״/g;
  const phrases: string[] = [];
  for (const match of text.matchAll(pattern)) {
    // Exactly one alternative captures; the rest are undefined at runtime even
    // though the match type does not say so.
    const captured = match.slice(1).find((group: string | undefined) => group !== undefined);
    const value = (captured ?? '').trim();
    if (value.length >= MIN_QUOTED_LENGTH) phrases.push(value);
  }
  return phrases;
}

export interface ParsedInterval {
  raw: string;
  from: ParsedDate;
  to: ParsedDate;
}

/**
 * Intervals of the form "בין <date> ל<date>" / "בין <date> לבין <date>",
 * with or without the definite ה־ prefix on either endpoint.
 *
 * An interval claim is checkable in a way a dated act is not: the archive
 * either does or does not hold a capture inside it, and one that does means
 * the thesis stated a wider window than the evidence requires.
 */
export function extractIntervals(text: string): ParsedInterval[] {
  const prefix = String.raw`(?:ה[-־]?)?`;
  const pattern = new RegExp(
    String.raw`בין\s+${prefix}(${DATE_PATTERN_SRC})\s+(?:לבין|ל)[-־]?\s*${prefix}(${DATE_PATTERN_SRC})`,
    'g',
  );
  const intervals: ParsedInterval[] = [];
  for (const match of text.matchAll(pattern)) {
    const from = parseDate(match[1]);
    const to = parseDate(match[2]);
    if (from && to && from.iso < to.iso) {
      intervals.push({ raw: match[0], from, to });
    }
  }
  return intervals;
}
