import type { Verdict } from '../lib/verdict';
import { auditAssertion, type AuditedRecord } from './framingAudit';
import type { AssessedContent, PromotionAssessment } from './promotionAssessor';

// ---------------------------------------------------------------------------
// THE AUDIT OF THE DEBATE'S ASSESSMENT — evidence A4 :1121 as RULED 2026-09-25 (the researcher, R81 QA); thesis A4
// :1476's ASSESSMENT body as conformed (R82 Entry 2, S3); document A7 :1581, the verdict rule's FOURTH caller.
//
// "The assessor also NAMES each assertion it makes, a span of the citing passage and the phrase it attributes to the
// record, and the audit records `quoteVerified` and `phraseVerified` beside each, as the framing round does."
//
// PURE: values in, verdicts out — no database client, no model, no fetch. It runs on the zod-PARSED assessment, and its
// output is what `respondInDebate.assessAndRecord` stores in ASSESSMENT_RETURNED's JSON.
//
// NOTHING IS SPELLED HERE. The guard, the quote check and the verdict rule are `framingAudit.auditAssertion`'s, CALLED:
// a second emptiness guard or a second fold in this file would be the second spelling document A7's scan forbids.
//
// NOTHING GATES ON AN ASSERTION'S VERDICT. SUBSTANCE stays the model's hard gate (T3) and MERIT its advisory one; the
// verdicts are shown beside the assertions and decide nothing.
// ---------------------------------------------------------------------------

/** One assertion with the verdicts beside it — thesis A4 :1476's five fields, in its order. */
export interface AuditedAssertion {
  researcherClaim: string;
  quoteVerified: boolean;
  whatEvidenceShows: string;
  phraseVerified: Verdict;
  /** Why no verdict could be reached, beside UNCHECKED; null beside PRESENT and ABSENT (document flows §3 :363). */
  phraseVerifiedReason: string | null;
}

/**
 * What the ONE verdict rule searches for the debated record: a capture's text, a diff's chunks, or a document's CURRENT
 * text — NULL where the content is its bytes, handed as a file or not at all, so every assertion over it is UNCHECKED.
 */
function recordOf(content: AssessedContent): AuditedRecord {
  if (content.kind === 'DOCUMENT') {
    return { kind: 'DOCUMENT', text: content.reading.form === 'TEXT' ? content.reading.text : null };
  }
  return content;
}

/**
 * Every assertion the assessor named, audited against the passages that cite the record and the record's content.
 *
 * `passages` is EVERY paragraph of the head version carrying the citation (`debatePassage.passagesCiting`), so a claim
 * quoted from any of them is a span of "the citing passage" (evidence A4 :1121).
 */
export function auditDebateAssertions(
  assertions: PromotionAssessment['assertions'],
  passages: readonly string[],
  content: AssessedContent,
): AuditedAssertion[] {
  const record = recordOf(content);
  return assertions.map((assertion): AuditedAssertion => {
    // The record is always supplied: a debate argues for exactly one, and this is its content.
    const verdicts = auditAssertion(assertion, passages, record);
    return {
      researcherClaim: assertion.researcherClaim,
      quoteVerified: verdicts.quoteVerified,
      whatEvidenceShows: assertion.whatEvidenceShows,
      phraseVerified: verdicts.phraseVerified,
      phraseVerifiedReason: verdicts.phraseVerifiedReason,
    };
  });
}
