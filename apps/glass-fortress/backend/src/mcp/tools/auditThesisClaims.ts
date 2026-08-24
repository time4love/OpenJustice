import { z } from 'zod';
import { auditThesisClaims } from '../../services/thesisClaimAudit';

// ---------------------------------------------------------------------------
// audit_thesis_claims
//
// Which factual assertions in this thesis body can be checked mechanically,
// and do they hold?
//
// Composes list_captures and verify_claim_text over the head version's prose.
// Three classes of assertion are extractable deterministically:
//
//   dates      — does a capture exist on that date, and does the sentence
//                assert an ACT on it where the archive supports only an
//                interval between captures? The most productive check in the
//                set: it caught two of the four errors in the first walk.
//   quotations — is the quoted text really in the captures the sentence points at?
//   intervals  — are the two endpoints adjacent captures with nothing between?
//
// The result also carries `notChecked`, listing what this tool cannot see —
// Hebrew number-word spans and counts, paraphrase, and every question of
// meaning. One of the four errors ("six weeks" for a 31-day span) is in that
// list, and would NOT have been caught here. A tool that states its blind spots
// is worth more than one that implies completeness.
//
// No model is involved anywhere in it. A model judging model prose is how a
// phantom quote survived three rounds of assessment.
// ---------------------------------------------------------------------------

export const auditThesisClaimsSchema = {
  thesisId: z.string().describe('The thesis whose HEAD version should be audited'),
  url: z
    .string()
    .url()
    .optional()
    .describe(
      'Audit against this tracked page only. Omit to derive the pages from the version’s own ' +
        'tracked-URL and evidence mentions.',
    ),
};

export async function auditThesisClaimsHandler(input: {
  thesisId: string;
  url?: string;
}): Promise<string> {
  const result = await auditThesisClaims(input.thesisId, {
    ...(input.url ? { url: input.url } : {}),
  });

  if (result.status !== 'OK') return JSON.stringify(result);

  const flagged = result.summary.datesFlagged + result.summary.intervalsFlagged;
  const unresolved =
    result.summary.quotationsAbsent +
    result.summary.quotationsDiverged;

  return JSON.stringify({
    ...result,
    headline:
      flagged + unresolved === 0
        ? 'Nothing this tool checks came back wrong. That is not the same as the thesis being right — ' +
          'read `notChecked`, and read `quotationsNotChecked`, before treating it as clearance.'
        : `${String(flagged)} dated/interval assertion(s) claim more than the archive supports, and ` +
          `${String(unresolved)} quotation(s) are absent from the raw archived page or invisible to this ` +
          'platform’s extraction of it.',
    ...(result.pagesUnavailable.length > 0
      ? {
          coverageWarning:
            `The archive did not answer for ${String(result.pagesUnavailable.length)} page(s) in scope. ` +
            'Nothing was checked against them — their assertions are unexamined, not clean.',
        }
      : {}),
    ...(result.scopeTruncated
      ? {
          scopeWarning:
            'This version cites more tracked pages than one audit consults. Assertions about the ' +
            'pages not listed in `pages` were not checked. Pass `url` to audit a specific one.',
        }
      : {}),
  });
}
