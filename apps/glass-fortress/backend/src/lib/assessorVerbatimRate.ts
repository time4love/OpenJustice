/**
 * THE FRAMING ASSESSOR'S VERBATIM RATE — thesis flows §13 `:1203` and A7 `:1666`.
 *
 * "How often `researcherClaim` fails the substring check, on real rounds — decides whether 'flag,
 * never drop' costs the researcher a round; the four legacy runs failed it four times."
 *
 * THE COUNTING IS PURE, AND IT IS HERE RATHER THAN IN THE SCRIPT FOR ONE REASON. A7 `:1616–:1618`:
 * "None is proven until it has been observed to FAIL … each lands with the breakage that makes it
 * exit non-zero, recorded in its test." A read-only measurement exits 0 whatever it measures, so
 * what is observed to fail is the COUNT — and a count can only be broken into if it is reachable
 * without a deployment. `scripts/measureAssessorVerbatim.ts` is then the query and
 * `runOperationalScript`, and nothing else; `test/operationalScriptsGuarded.test.ts` holds that
 * half, which no test can run.
 *
 * IN `lib/` BECAUSE IT IS PURE — rows in, numbers out, no client and no environment. A module that
 * holds a database client depends on the pure one, never the reverse (thesis A1 `:1247–:1250` as
 * amended at step 18).
 */

/** An ASSESSED round, as the measurement reads it: whatever the row's `content` Json holds. */
export interface AssessedRoundRow {
  framingId: string;
  sequence: number;
  content: unknown;
}

export interface VerbatimRate {
  /** ASSESSED rounds looked at — INCLUDING ones carrying no contradiction. */
  roundsExamined: number;
  /** Contradictions inside them — the denominator of the rate. */
  contradictionsExamined: number;
  /** Those whose `researcherClaim` failed the substring check. */
  notVerbatim: number;
  /**
   * `notVerbatim / contradictionsExamined`, to four places — or null when nothing was examined.
   *
   * NULL, NEVER 0. A7 `:1656–:1657`: "a pass that examined nothing says zero, never nothing" — the
   * COUNTS say zero, and the RATE says it has no value, because 0/0 reported as `0.0000` would read
   * as "the assessor never paraphrased anyone" when nothing was ever checked.
   */
  rate: number | null;
  /** A round whose stored content is not the shape the audit writes — counted, never silently skipped. */
  malformed: number;
}

/**
 * The rate over the rounds handed in.
 *
 * A MALFORMED ROUND IS COUNTED AND NOT DROPPED. A silent filter here would make the denominator
 * smaller and the rate better, which is the direction a measurement must never fail in.
 */
export function verbatimRate(rounds: readonly AssessedRoundRow[]): VerbatimRate {
  let contradictionsExamined = 0;
  let notVerbatim = 0;
  let malformed = 0;

  for (const round of rounds) {
    const contradictions = contradictionsOf(round.content);
    if (contradictions === null) {
      malformed += 1;
      continue;
    }
    for (const c of contradictions) {
      contradictionsExamined += 1;
      if (!c) notVerbatim += 1;
    }
  }

  return {
    roundsExamined: rounds.length,
    contradictionsExamined,
    notVerbatim,
    rate: contradictionsExamined === 0 ? null : Number((notVerbatim / contradictionsExamined).toFixed(4)),
    malformed,
  };
}

/** Each contradiction's `quoteVerified`, or null when the content is not the shape the audit writes. */
function contradictionsOf(content: unknown): boolean[] | null {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return null;
  const { contradictions: list } = content as { contradictions?: unknown };
  if (!Array.isArray(list)) return null;
  const verdicts: boolean[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return null;
    const { quoteVerified: value } = item as { quoteVerified?: unknown };
    if (typeof value !== 'boolean') return null;
    verdicts.push(value);
  }
  return verdicts;
}

/** The report a person reads — the counts first, and the rate said to be absent when it is. */
export function formatVerbatimRate(report: VerbatimRate): string {
  const rate =
    report.rate === null
      ? 'no rate — nothing was examined'
      : `${(report.rate * 100).toFixed(2)}% of contradictions were NOT verbatim`;
  return [
    `ASSESSED rounds examined: ${String(report.roundsExamined)}`,
    `contradictions examined: ${String(report.contradictionsExamined)}`,
    `not verbatim:            ${String(report.notVerbatim)}`,
    `malformed rounds:        ${String(report.malformed)}`,
    rate,
  ].join('\n');
}
