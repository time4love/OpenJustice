import { verdict, type Verdict } from '../lib/verdict';
import { documentsByCommitment } from './documentCitation';
import { documentRefusal, type DocumentRefusal } from './documentRefusals';

// ---------------------------------------------------------------------------
// A PHRASE, CHECKED AGAINST A DOCUMENT — `verify_claim_text`'s document ARM, docs/gf-document-flows.md A4 :1470 (RULED
// 2026-09-23, in scope 2026-09-24, R81 Q3; R78's item 1).
//
// "The ONE verdict rule (A3 :1385) over CURRENT(d)'s computed text — PRESENT | ABSENT | UNCHECKED, UNCHECKED where the
// content is bytes (§3 :359–:365) — with the surrounding lines of a PRESENT match; free, writes nothing, GATED as
// read_document; refuses NOT_A_DOCUMENT · AWAITING_DERIVATION · SHED · NEITHER … a phrase in and a verdict out, never a
// search over the text (§12 :1190–:1191); advisory and never stored."
//
// THE VERDICT IS `lib/verdict`'s, CALLED — this module spells no PRESENT | ABSENT | UNCHECKED of its own
// (`verdict-rule-one-spelling`, A7 :1579–:1581). The surrounding lines are LOCATED with the same symbol: the smallest
// run of consecutive lines the rule finds the phrase in, by two binary searches over prefixes and suffixes (the rule is
// monotone in the text it is handed), so the context is exactly where the rule matched — never a second matcher that
// could disagree with it, and never a list of occurrences, which would be a search.
//
// IT LOADS THROUGH `documentCitation` — CUSTODY(d) and CURRENT(d) the one loader's, the same the version write pins — and
// it reaches no chain: `test/researchActsReachNoChain.test.ts` holds it among its subjects. NEITHER is the TOOL's, decided
// from the input before this module is called.
// ---------------------------------------------------------------------------

/** How many lines either side of a PRESENT match the answer carries — "the surrounding lines" (A4 :1470), a width. */
export const CONTEXT_LINES = 2;

export type DocumentPhraseCode = 'NOT_A_DOCUMENT' | 'SHED' | 'AWAITING_DERIVATION';

export interface DocumentPhraseAnswer {
  commitment: string;
  /** CURRENT(d)'s version — the text the verdict was reached over. */
  contentVersionHash: string;
  phrase: string;
  verdict: Verdict;
  /** Why no verdict could be reached, for UNCHECKED; null otherwise. */
  reason: string | null;
  /** A PRESENT match's lines and CONTEXT_LINES either side, from line `from` (1-based); null unless PRESENT. */
  context: { from: number; lines: string[] } | null;
  /** Said on every answer: the check is advisory and stored nowhere — the stored verdicts are PassageVerdict's (A2 :1313). */
  advisory: string;
}

const ADVISORY =
  'Advisory: this verdict is not stored. The verdicts that bind are written at publication, one per quoted span ' +
  '(PassageVerdict), over the same computed text.';

/** The ONE verdict rule over CURRENT(d), with the context of a match — or the refusal. */
export async function verifyDocumentPhrase(
  commitment: string,
  phrase: string,
): Promise<DocumentPhraseAnswer | DocumentRefusal<DocumentPhraseCode>> {
  const cited = (await documentsByCommitment([commitment])).get(commitment);
  if (cited === undefined) {
    return documentRefusal('NOT_A_DOCUMENT', `No document is named ${commitment}. list_documents names every document with its commitment.`);
  }
  const { current, shed } = cited;
  if ('shed' in current) {
    // A LOUD GUARD for an unreachable world, as the version write's (`thesisVersionWrite.ts`, the same state): CURRENT(d)
    // reads SHED only when a Shed row exists (`currentVersion`), so a shed CURRENT without one is a defective load.
    if (shed === null) {
      throw new Error(`verifyDocumentPhrase: CURRENT of ${commitment} reads SHED and the document has no Shed row.`);
    }
    return documentRefusal(
      'SHED',
      `The content of ${commitment} was taken back (${shed.cause}, ${shed.at.toISOString().slice(0, 10)}): there is no text to ` +
        'check a phrase against.',
    );
  }
  if ('awaiting' in current) {
    return documentRefusal(
      'AWAITING_DERIVATION',
      `${commitment} has no content version under the current extractor: the derivation pass owes it one, and there is ` +
        'nothing to check the phrase against until it is derived.',
    );
  }

  const base = { commitment, contentVersionHash: current.contentVersionHash, phrase, advisory: ADVISORY };
  if (current.text === null) {
    return {
      ...base,
      verdict: verdict(phrase, null),
      reason: current.readFailed
        ? 'The reader FAILED on this document, so it has no computed text: the phrase cannot be checked by the platform.'
        : 'This document\'s content is its bytes — no text was computed from them — so the phrase cannot be checked by the ' +
          'platform. What the document shows is a reader\'s, never a verdict.',
      context: null,
    };
  }

  const found = verdict(phrase, current.text);
  return { ...base, verdict: found, reason: null, context: found === 'PRESENT' ? contextOf(phrase, current.text) : null };
}

/**
 * The smallest run of lines [start, end] the rule finds `phrase` in, widened by CONTEXT_LINES. `end` is the first line
 * by which the text so far holds the phrase; `start` the last line from which lines start..end still hold it. Both
 * searches are over a MONOTONE property of the text handed to the one rule, so the binary search is exact.
 */
function contextOf(phrase: string, text: string): { from: number; lines: string[] } {
  const lines = text.split('\n');
  const holds = (from: number, to: number): boolean => verdict(phrase, lines.slice(from, to + 1).join('\n')) === 'PRESENT';

  let low = 0;
  let high = lines.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (holds(0, mid)) high = mid;
    else low = mid + 1;
  }
  const end = low;

  low = 0;
  high = end;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (holds(mid, end)) low = mid;
    else high = mid - 1;
  }
  const start = low;

  const from = Math.max(0, start - CONTEXT_LINES);
  return { from: from + 1, lines: lines.slice(from, end + CONTEXT_LINES + 1) };
}
