import { z } from 'zod';
import { getResearcherId } from '../../context/researcherContext';
import { assessPublication, publishThesis, unpublishThesis } from '../../services/thesisPublication';

// ---------------------------------------------------------------------------
// Publishing a thesis — the last step of the thesis workflow, and until this
// existed the least gated write in the system. All three tools are gated.
// ---------------------------------------------------------------------------

const RATIONALE_GUIDANCE =
  'Your argued case for publishing. It must state three things: what this thesis claims, what the cited ' +
  'evidence supports, and WHERE IT STOPS — what is asserted as allegation rather than established fact. ' +
  'Substance is a hard gate (did you argue); merit is advisory (are you right) and recorded either way.';

const PUBLIC_INTEREST_GUIDANCE =
  'The public-interest anchor (COMPLIANCE.md Rule 5): why the public needs this narrative. Stored on the ' +
  'thesis and rendered on every public page. Required to publish.';

function unauthenticated(): string {
  return JSON.stringify({
    error: 'UNAUTHENTICATED',
    explanation: 'No researcher identity on this call. This tool is gated and must be called with a researcher token.',
  });
}

export const checkPublicationReadinessSchema = {
  thesisId: z.string().min(1).describe('The thesis to check'),
  rationale: z.string().optional().describe(`Optional. ${RATIONALE_GUIDANCE} Given here, it is assessed without publishing.`),
  publicInterestStatement: z
    .string()
    .optional()
    .describe(`Optional. ${PUBLIC_INTEREST_GUIDANCE} Given here, it is evaluated in place of the stored one, without saving.`),
};

export async function checkPublicationReadinessHandler(input: {
  thesisId: string;
  rationale?: string;
  publicInterestStatement?: string;
}): Promise<string> {
  const report = await assessPublication(input.thesisId, input.rationale ?? null, input.publicInterestStatement);
  if ('error' in report) return JSON.stringify(report);

  return JSON.stringify({
    ...report,
    explanation: report.publishable
      ? 'Every hard check passes. publish_thesis will pin the head version' +
        (report.advisoryFailures.length > 0
          ? `; the advisory checks not met (${report.advisoryFailures.join(', ')}) will be recorded with the publication.`
          : '.')
      : `Not publishable. Hard checks failing: ${report.hardFailures.join(', ')}. Each is described in checks[].`,
  });
}

export const publishThesisSchema = {
  thesisId: z.string().min(1).describe('The thesis whose HEAD version will be published'),
  rationale: z.string().min(1).describe(RATIONALE_GUIDANCE),
  publicInterestStatement: z.string().optional().describe(`${PUBLIC_INTEREST_GUIDANCE} Saved on the thesis even if this attempt is refused.`),
};

export async function publishThesisHandler(input: {
  thesisId: string;
  rationale: string;
  publicInterestStatement?: string;
}): Promise<string> {
  const researcherId = getResearcherId();
  if (!researcherId) return unauthenticated();

  const result = await publishThesis(input.thesisId, researcherId, input.rationale, input.publicInterestStatement);
  if ('error' in result) return JSON.stringify(result);

  if (!result.published) {
    return JSON.stringify({
      ...result,
      explanation: `Refused. Hard checks failing: ${result.refusedBy.join(', ')}. The rationale and assessment were recorded on session ${result.sessionId}.`,
    });
  }

  return JSON.stringify({
    ...result,
    explanation:
      `Version ${result.publishedVersionId} is now what the public sees, and will remain so until publish_thesis ` +
      'is called again — editing the head changes nothing public.' +
      (result.overObjection ? ' Published over the assessor\'s objection; the dissent is on the record.' : ''),
  });
}

export const unpublishThesisSchema = {
  thesisId: z.string().min(1).describe('The thesis to withdraw from public view'),
  reason: z.string().min(1).describe('Why. Recorded on the session.'),
};

export async function unpublishThesisHandler(input: { thesisId: string; reason: string }): Promise<string> {
  const researcherId = getResearcherId();
  if (!researcherId) return unauthenticated();

  const result = await unpublishThesis(input.thesisId, researcherId, input.reason);
  if ('error' in result) return JSON.stringify(result);

  return JSON.stringify({
    ...result,
    explanation:
      'The thesis is a DRAFT again, visible to approved researchers only. Nothing was deleted; the version can be published again.',
  });
}
