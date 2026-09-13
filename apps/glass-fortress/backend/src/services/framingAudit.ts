import { normaliseClaim } from '../lib/normalise';
import { verdict, type Verdict } from '../lib/verdict';
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
function textsOf(record: AssessedRecord): string[] {
  return record.kind === 'CAPTURE' ? [record.text] : record.chunks.map((c) => c.text);
}

/**
 * The verdict rule over a record's current content — a CALL of `lib/verdict`,
 * never a second spelling of it. PRESENT iff any one text carries the phrase.
 */
function phraseIn(phrase: string, record: AssessedRecord): Verdict {
  const texts = textsOf(record);
  // An empty collection is a record whose current content says nothing; the rule
  // is asked once against an empty text so the answer is ABSENT, never UNCHECKED
  // — the content was read, and it does not contain the phrase.
  if (texts.length === 0) return verdict(phrase, '');
  return texts.some((text) => verdict(phrase, text) === 'PRESENT') ? 'PRESENT' : 'ABSENT';
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

  // `quoteVerified` — a whitespace-collapsed substring of the proposal (T1 :256).
  // NORMALISE is CALLED, from `lib/normalise`; a second `replace(/\s+/g, ' ')`
  // here is a scan failure (thesis A7's `one-symbol`).
  const proposal = normaliseClaim(input.proposedFraming);

  const contradictions = input.assessment.contradictions.map((c): AuditedContradiction => {
    const record = supplied.get(c.record);

    // THE EMPTINESS GUARD, ON BOTH FIELDS AND ON THE NORMALISED FORM.
    //
    // `FramingAssessmentSchema` types both as `z.string()` with no minimum, and
    // `''.includes('')` is true — so an assessor returning an empty string once
    // parsed and was reported VERIFIED for an assertion that says nothing. That is
    // the house's own shape: a vacuity guard written for one field and not its
    // neighbour (`filled` below carries `named.length > 0`; these two carried
    // nothing). NORMALISED, not `=== ''`, because a whitespace-only string is
    // equally empty and would otherwise pass.
    //
    // AND IT IS NOT A REFUSAL. Nothing gates on a framing verdict (T1 :294–:304):
    // the assertion is recorded with an honest verdict, never dropped.
    //
    // IT LIVES HERE AND NOT IN `lib/verdict.ts`, WHICH STAYS TOTAL. Asked whether
    // a text contains the empty string, `verdict('', text)` answering PRESENT is
    // correct; what is wrong is calling an empty assertion CHECKED. The meaning of
    // an assertion belongs to the audit, so the guard does too — do not "fix" the
    // pure symbol.
    const claim = normaliseClaim(c.researcherClaim);
    const phrase = normaliseClaim(c.whatEvidenceShows);

    // An empty claim is not a verbatim span of the proposal; it is not a quotation
    // at all.
    const quoteVerified = claim !== '' && proposal.includes(claim);

    if (phrase === '') {
      return {
        researcherClaim: c.researcherClaim,
        quoteVerified,
        whatEvidenceShows: c.whatEvidenceShows,
        record: c.record,
        phraseVerified: 'UNCHECKED',
        phraseVerifiedReason:
          'The assessment attributes no phrase to this record — the field is empty — so there is ' +
          'nothing to search for and no verdict was reached. An empty assertion is not a verified ' +
          'one.',
      };
    }

    if (record === undefined) {
      return {
        researcherClaim: c.researcherClaim,
        quoteVerified,
        whatEvidenceShows: c.whatEvidenceShows,
        record: c.record,
        phraseVerified: 'UNCHECKED',
        phraseVerifiedReason:
          `The assessment names ${c.record}, which is not one of the records this call supplied, so ` +
          'there is no content to check the phrase against. The assertion stands unverified rather ' +
          'than unreported.',
      };
    }
    return {
      researcherClaim: c.researcherClaim,
      quoteVerified,
      whatEvidenceShows: c.whatEvidenceShows,
      record: c.record,
      phraseVerified: phraseIn(c.whatEvidenceShows, record),
      phraseVerifiedReason: null,
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
