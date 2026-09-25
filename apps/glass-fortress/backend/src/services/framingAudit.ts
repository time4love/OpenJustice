import { normaliseClaim } from '../lib/normalise';
import { verdict, verdictInAny, type Verdict } from '../lib/verdict';
import type { AssessedRecord, FramingAssessment } from './framingAssessor';

// ---------------------------------------------------------------------------
// THE AUDIT OF THE FRAMING ASSESSMENT — docs/gf-thesis-flows.md T1 :253–:266,
// "AUDITS the assessment before recording it, MECHANICALLY, NO MODEL".
//
// PURE: values in, verdicts out. No database client, no model, no fetch. It runs
// on the zod-PARSED assessment and its output is what the tool records — A7's
// `models-write-no-state`, "their output reaches a row only through the tool that
// called them, AFTER THE AUDIT".
//
// BOTH PARTIES TO THE ROUND ARE AUDITED BY THE SAME RULE (T1 :300–:305), and the
// one whose assertions went unverified was the one the researcher was told to
// defer to. Nothing GATES on any verdict here: "a contradiction that misquotes
// the researcher is shown, labelled, and never dropped" — ruled 2026-09-03 on
// four runs that reproduced the same three errors
// (docs/gf-framing-assessor-defects.md).
// ---------------------------------------------------------------------------

/** A contradiction with the two verdicts the audit adds — A4 :1446–:1448's five fields. */
export interface AuditedContradiction {
  researcherClaim: string;
  quoteVerified: boolean;
  whatEvidenceShows: string;
  record: string;
  phraseVerified: Verdict;
  /**
   * Why a verdict could not be reached, where it could not — never a bare UNCHECKED.
   *
   * `string | null` rather than optional, because this object is stored as the round's `content`
   * Json: an OPTIONAL property is `string | undefined`, which Prisma's `InputJsonValue` refuses,
   * and `undefined` has no JSON spelling. Null is the absence, written down.
   */
  phraseVerifiedReason: string | null;
}

/** An element with the verdict the audit adds. */
export interface AuditedElement {
  element: string;
  filled: boolean;
  records: string[];
}

export interface AuditedAssessment {
  candidateFramings: FramingAssessment['candidateFramings'];
  contradictions: AuditedContradiction[];
  unverifiedAssumptions: FramingAssessment['unverifiedAssumptions'];
  elements: AuditedElement[];
  recommendedFraming: string;
  reasoning: string;
}

/**
 * A DOCUMENT as the fold reads it — CURRENT(d)'s computed text, or NULL where the content is its bytes (document flows
 * §3 :359–:365). ADDED AT DOCUMENT STEP 33 (R81 QA, Entry 16's consequence; R82 Entry 2, S2): the debate's audit is the
 * verdict rule's fourth caller (document A7 :1581) and its record may be a document. The FRAMING assessor is handed no
 * document, so `AssessedRecord` — its input — is unchanged; only the fold's input widens.
 */
export interface AuditedDocument {
  kind: 'DOCUMENT';
  text: string | null;
}

/**
 * What the ONE verdict rule may be asked over: a capture's text, a diff's chunks, or a document — the CONTENT alone, so
 * the framing assessor's labelled records and the debate's assessed content both satisfy it without a conversion.
 */
export type AuditedRecord =
  | Pick<Extract<AssessedRecord, { kind: 'CAPTURE' }>, 'kind' | 'text'>
  | Pick<Extract<AssessedRecord, { kind: 'DIFF' }>, 'kind' | 'chunks'>
  | AuditedDocument;

/**
 * CONTENT_OF — what the ONE verdict rule searches for a record, and it is the
 * whole of the rule.
 *
 * A CAPTURE is one text. A DIFF is its CURRENT version's CHUNKS, and EACH CHUNK
 * IS SEARCHED SEPARATELY: the verdict is PRESENT iff SOME SINGLE chunk carries
 * the phrase. THERE IS NO JOIN, so no separator can be wrong — and `normaliseClaim`
 * collapses every separator to one space, so a joined implementation would report
 * a phrase STRADDLING two chunks as PRESENT although no chunk says it.
 *
 * Ground: T1 :228–:229 names what the assessor is handed as "a capture's text, a
 * diff's CHUNKS, a trajectory's history" — a COLLECTION, not the two side strings
 * — with T1 :258–:262's "that record's CURRENT content".
 *
 * BOTH SIDES ARE SEARCHED, REMOVED AND ADDED ALIKE. Evidence A1 :911 defines a
 * DIFF's `contentVersionHash` as `sha256( utf8( JSON of [ { side, text } … ] ) )`
 * — "the differ's raw segments in the differ's output order". That IS the
 * record's current content by the platform's own definition: both sides inside
 * it, `before` and `after` outside it. A phrase a REMOVED chunk carries is
 * PRESENT — the record shows the page once said it and that it was taken away,
 * which for this corpus is usually the point.
 */
function textsOf(record: Exclude<AuditedRecord, AuditedDocument>): string[] {
  return record.kind === 'CAPTURE' ? [record.text] : record.chunks.map((c) => c.text);
}

/**
 * The verdict rule over a record's current content — a CALL of `lib/verdict`'s fold over several texts, never a second
 * spelling of it (thesis step 22, L1). PRESENT iff any one text carries the phrase; an empty collection is ABSENT.
 *
 * A DOCUMENT is ONE text, or none: its null text is handed to `verdict` AS NULL, so a document whose content is its
 * bytes is UNCHECKED through the one symbol and never ABSENT — `verdictInAny` over `[]` would say ABSENT, which is a
 * reading of nothing reported as a search that found nothing.
 */
export function phraseIn(phrase: string, record: AuditedRecord): Verdict {
  if (record.kind === 'DOCUMENT') return verdict(phrase, record.text);
  return verdictInAny(phrase, textsOf(record));
}

/** Why an assertion with no phrase has no verdict — one wording for every audit that calls `auditAssertion`. */
const EMPTY_PHRASE =
  'The assessment attributes no phrase to this record — the field is empty — so there is ' +
  'nothing to search for and no verdict was reached. An empty assertion is not a verified ' +
  'one.';

/** Why a document's assertion has no verdict — its content is its bytes (document flows §3 :359–:365). */
const BYTES_CONTENT =
  "The record's content is its bytes — no text was computed from them — so the phrase cannot be checked by the " +
  'platform. What the bytes show is a reader\'s, never a verdict.';

/** The three verdicts the audit adds beside an assertion. */
export interface AssertionVerdicts {
  quoteVerified: boolean;
  phraseVerified: Verdict;
  /** Why no verdict could be reached, beside UNCHECKED; null beside PRESENT and ABSENT. */
  phraseVerifiedReason: string | null;
}

/**
 * ONE ASSERTION, AUDITED — the guard and the two checks every assessor audit applies, spelled ONCE (R82 Entry 2, S4).
 * The framing round and the debate each CALL this; neither re-spells the emptiness guard.
 *
 * `quoteVerified` — a whitespace-collapsed substring of ANY of `quoteSources` (T1 :256): the framing round's one
 * proposal, or every paragraph that cites the debated record (evidence A4 :1121, "a span of the citing passage").
 * `phraseVerified` — the ONE verdict rule over `record`'s current content; where the assertion names a record the call
 * never supplied, `record` carries the reason instead, and the verdict is UNCHECKED with it.
 */
export function auditAssertion(
  assertion: { researcherClaim: string; whatEvidenceShows: string },
  quoteSources: readonly string[],
  record: AuditedRecord | { unsupplied: string },
): AssertionVerdicts {
  // THE EMPTINESS GUARD, ON BOTH FIELDS AND ON THE NORMALISED FORM.
  //
  // Both assessors type these fields as `z.string()` with no minimum, and
  // `''.includes('')` is true — so an assessor returning an empty string once
  // parsed and was reported VERIFIED for an assertion that says nothing. That is
  // the house's own shape: a vacuity guard written for one field and not its
  // neighbour. NORMALISED, not `=== ''`, because a whitespace-only string is
  // equally empty and would otherwise pass.
  //
  // AND IT IS NOT A REFUSAL. Nothing gates on an assertion's verdict (T1 :294–:304):
  // the assertion is recorded with an honest verdict, never dropped.
  //
  // IT LIVES HERE AND NOT IN `lib/verdict.ts`, WHICH STAYS TOTAL. Asked whether
  // a text contains the empty string, `verdict('', text)` answering PRESENT is
  // correct; what is wrong is calling an empty assertion CHECKED. The meaning of
  // an assertion belongs to the audit, so the guard does too — do not "fix" the
  // pure symbol.
  //
  // NORMALISE is CALLED, from `lib/normalise`; a second `replace(/\s+/g, ' ')`
  // here is a scan failure (thesis A7's `one-symbol`).
  const claim = normaliseClaim(assertion.researcherClaim);
  const phrase = normaliseClaim(assertion.whatEvidenceShows);

  // An empty claim is not a verbatim span of the source; it is not a quotation at all.
  const quoteVerified = claim !== '' && quoteSources.some((source) => normaliseClaim(source).includes(claim));

  if (phrase === '') return { quoteVerified, phraseVerified: 'UNCHECKED', phraseVerifiedReason: EMPTY_PHRASE };
  if ('unsupplied' in record) return { quoteVerified, phraseVerified: 'UNCHECKED', phraseVerifiedReason: record.unsupplied };
  const found = phraseIn(assertion.whatEvidenceShows, record);
  // UNCHECKED from the fold is reachable ONLY through a document whose text is null — a capture and a diff always
  // have text to search — so the reason is the bytes'.
  return { quoteVerified, phraseVerified: found, phraseVerifiedReason: found === 'UNCHECKED' ? BYTES_CONTENT : null };
}

export interface AuditInput {
  /** The researcher's proposal, verbatim — what `researcherClaim` must be a span of. */
  proposedFraming: string;
  /** The provision's element shapes, so an element the assessor omitted is still reported. */
  elementShapes: readonly string[];
  /** Exactly the records the researcher SUPPLIED, each already loaded and ACQUIRED. */
  records: readonly AssessedRecord[];
  assessment: FramingAssessment;
}

/**
 * Every assertion of the assessment, with a verdict beside it.
 *
 * NOTHING IS DROPPED. A contradiction that fails the substring check is recorded
 * with `quoteVerified: false`, which tells the researcher "the machine paraphrased
 * you here" and suppresses nothing (T1 :294–:300). An assertion naming a record
 * the call never supplied is recorded UNCHECKED WITH ITS REASON — of the three
 * values it is the only honest one, and document flows :359–:365's principle,
 * never silently PRESENT, is the nearest ground.
 */
export function auditAssessment(input: AuditInput): AuditedAssessment {
  const supplied = new Map(input.records.map((r) => [r.label, r]));

  // Every assertion through the ONE guard — `auditAssertion` above, which the debate's audit calls too. A
  // contradiction naming a record the call never supplied is UNCHECKED WITH ITS REASON (the docblock above).
  const contradictions = input.assessment.contradictions.map((c): AuditedContradiction => {
    const verdicts = auditAssertion(c, [input.proposedFraming], supplied.get(c.record) ?? {
      unsupplied:
        `The assessment names ${c.record}, which is not one of the records this call supplied, so ` +
        'there is no content to check the phrase against. The assertion stands unverified rather ' +
        'than unreported.',
    });
    return {
      researcherClaim: c.researcherClaim,
      quoteVerified: verdicts.quoteVerified,
      whatEvidenceShows: c.whatEvidenceShows,
      record: c.record,
      phraseVerified: verdicts.phraseVerified,
      phraseVerifiedReason: verdicts.phraseVerifiedReason,
    };
  });

  // `filled` — "the record it names is one the researcher SUPPLIED, and it is
  // ACQUIRED; an element 'filled' by a record nobody holds is UNFILLED" (T1
  // :263–:265). BOTH HALVES, and the ACQUIRED half is carried by the SET rather
  // than re-derived: `assess_framing` has already refused NOT_ACQUIRED for every
  // supplied record, so `supplied` IS the supplied-and-acquired set. Written as
  // one lookup into that set, and said here, because a rule stated as one
  // conjunct silently loses its other half the day the refusal moves.
  const byElement = new Map(input.assessment.elements.map((e) => [e.element, e.records]));
  const elements = input.elementShapes.map((element): AuditedElement => {
    const named = byElement.get(element) ?? [];
    const held = named.filter((label) => supplied.has(label));
    return { element, filled: named.length > 0 && held.length === named.length, records: held };
  });

  return {
    candidateFramings: input.assessment.candidateFramings,
    contradictions,
    unverifiedAssumptions: input.assessment.unverifiedAssumptions,
    elements,
    recommendedFraming: input.assessment.recommendedFraming,
    reasoning: input.assessment.reasoning,
  };
}
