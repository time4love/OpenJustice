/**
 * THE ABSENT-PHRASE RATE — thesis flows §13 `:1204` and A7 `:1667`: "`phraseVerified: ABSENT` on the assessors' and the
 * critic's assertions — the rate at which a model attributes to a record what it does not say — the stock-phrase defect,
 * counted."
 *
 * `lib/assessorVerbatimRate.ts`' SHAPE, AND FOR ITS REASON (A7 `:1616–:1618`): a read-only measurement exits 0 whatever
 * it measures, so what is observed to fail is the COUNT, and a count can be broken into only when it is reachable
 * without a deployment. `scripts/measurePhraseVerified.ts` is the query and `runOperationalScript`, and nothing else.
 *
 * LANDS AT THESIS STEP 22 (the researcher's ruling of 2026-09-12; R48 §6-5): framing rounds were half its subject from
 * step 19, and the critic's analyses — the other half — exist from this step.
 *
 * PURE — rows in, numbers out; no client and no environment.
 */

export type PhraseSource = 'ASSESSMENT' | 'ANALYSIS';

/** A stored assessment or analysis, as the measurement reads it: whatever the row's Json holds. */
export interface PhraseVerifiedRow {
  source: PhraseSource;
  content: unknown;
}

export interface PhraseCounts {
  rowsExamined: number;
  /** Assertions carrying a verdict — PRESENT, ABSENT and UNCHECKED alike. */
  assertionsExamined: number;
  present: number;
  absent: number;
  /** Counted APART and kept OUT of the rate's denominator: an unchecked assertion is not a verified one. */
  unchecked: number;
  /**
   * `absent / (present + absent)`, to four places — or null when no assertion was checked.
   *
   * NULL, NEVER 0 (A7 `:1656–:1657`). And UNCHECKED stays outside the denominator: counted in, it would make the rate
   * SMALLER the less the audit could check — the one direction a measurement must never fail in.
   */
  rate: number | null;
  /** A row whose stored Json is not the shape the audit writes — counted, never silently skipped. */
  malformed: number;
}

export interface PhraseVerifiedRate {
  assessments: PhraseCounts;
  analyses: PhraseCounts;
  total: PhraseCounts;
}

/** Where each source's audit writes its assertions: framing ASSESSED rounds' `contradictions`, analyses' `counterArguments`. */
const LIST_OF: Readonly<Record<PhraseSource, string>> = { ASSESSMENT: 'contradictions', ANALYSIS: 'counterArguments' };

/** Each assertion's `phraseVerified`, or null when the content is not the shape the audit writes. */
function verdictsOf(row: PhraseVerifiedRow): string[] | null {
  const content = row.content;
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return null;
  const list = (content as Record<string, unknown>)[LIST_OF[row.source]];
  if (!Array.isArray(list)) return null;
  const verdicts: string[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return null;
    const { phraseVerified } = item as { phraseVerified?: unknown };
    if (phraseVerified !== 'PRESENT' && phraseVerified !== 'ABSENT' && phraseVerified !== 'UNCHECKED') return null;
    verdicts.push(phraseVerified);
  }
  return verdicts;
}

function countsOf(rows: readonly PhraseVerifiedRow[]): PhraseCounts {
  let present = 0;
  let absent = 0;
  let unchecked = 0;
  let malformed = 0;
  for (const row of rows) {
    const verdicts = verdictsOf(row);
    if (verdicts === null) {
      malformed += 1;
      continue;
    }
    for (const v of verdicts) {
      if (v === 'PRESENT') present += 1;
      else if (v === 'ABSENT') absent += 1;
      else unchecked += 1;
    }
  }
  const checked = present + absent;
  return {
    rowsExamined: rows.length,
    assertionsExamined: checked + unchecked,
    present,
    absent,
    unchecked,
    rate: checked === 0 ? null : Number((absent / checked).toFixed(4)),
    malformed,
  };
}

/** The rate over the rows handed in, per source and together. */
export function phraseVerifiedRate(rows: readonly PhraseVerifiedRow[]): PhraseVerifiedRate {
  return {
    assessments: countsOf(rows.filter((r) => r.source === 'ASSESSMENT')),
    analyses: countsOf(rows.filter((r) => r.source === 'ANALYSIS')),
    total: countsOf(rows),
  };
}

function block(title: string, c: PhraseCounts): string {
  return [
    title,
    `  rows examined:       ${String(c.rowsExamined)}`,
    `  assertions examined: ${String(c.assertionsExamined)}`,
    `  PRESENT / ABSENT / UNCHECKED: ${String(c.present)} / ${String(c.absent)} / ${String(c.unchecked)}`,
    `  malformed rows:      ${String(c.malformed)}`,
    c.rate === null
      ? '  no rate — no assertion was checked (nothing was examined)'
      : `  ${(c.rate * 100).toFixed(2)}% of checked assertions were ABSENT from the record they named`,
  ].join('\n');
}

/** The report a person reads — the counts first, each rate said to be absent when it is. */
export function formatPhraseVerifiedRate(report: PhraseVerifiedRate): string {
  return [
    block('framing assessments', report.assessments),
    block("the critic's analyses", report.analyses),
    block('together', report.total),
  ].join('\n\n');
}
