import { prisma } from '../lib/prisma';
import { MissionVerdict, AssessmentAuthor } from '@prisma/client';

/**
 * The one place a mission verdict becomes stored state.
 *
 * `POST /api/forensics/scan` already screens submissions and returns 422 for an
 * off-mission URL. That gate is correct and stays. What it did not do is leave a
 * trace: the verdict and its reason existed only in an HTTP response body, so
 * §3 applied — a check that runs and is not recorded has not been performed.
 *
 * This is also the one place the platform FILTERS ITS OWN INPUTS, which is the
 * standard attack on curated evidence: "you kept what suited you." The answer is
 * not an assurance that the filter was principled; it is a queryable record of
 * everything turned away, and everything let through, and why.
 */

/**
 * A verdict and its provenance, as a DISCRIMINATED UNION.
 *
 * A MODEL assessment cannot be constructed without its provenance — the compiler
 * refuses it, rather than a runtime check catching it later. The database carries
 * the same rule as a CHECK constraint, because this is a check in one language
 * guarding a table any other path can write.
 */
export type MissionAssessmentInput =
  | {
      author: 'MODEL';
      url: string;
      verdict: MissionVerdict;
      reason: string;
      assessedAt: Date;
      model: string;
      agentVersion: string;
      promptHash: string;
      /** How many characters of page content the model was actually given. */
      contentChars: number;
      /** True when the page was longer than what the model saw. */
      contentTruncated: boolean;
      submitterId?: string | undefined;
    }
  | {
      author: 'HUMAN';
      url: string;
      verdict: MissionVerdict;
      reason: string;
      assessedAt: Date;
      actorId: string;
    };

export async function recordMissionAssessment(input: MissionAssessmentInput): Promise<void> {
  // APPEND-ONLY. A human overturning a model verdict writes a NEW ROW; the
  // model's verdict stays on the record beside the correction. That is what makes
  // the filter auditable rather than merely overridable — and it is the plan's
  // own "mark, never delete" applied to judgements about admission.
  if (input.author === 'MODEL') {
    await prisma.scanRelevanceAssessment.create({
      data: {
        url: input.url,
        verdict: input.verdict,
        reason: input.reason,
        author: AssessmentAuthor.MODEL,
        assessedAt: input.assessedAt,
        model: input.model,
        agentVersion: input.agentVersion,
        promptHash: input.promptHash,
        contentChars: input.contentChars,
        contentTruncated: input.contentTruncated,
        submitterId: input.submitterId ?? null,
      },
    });
    return;
  }
  await prisma.scanRelevanceAssessment.create({
    data: {
      url: input.url,
      verdict: input.verdict,
      reason: input.reason,
      author: AssessmentAuthor.HUMAN,
      assessedAt: input.assessedAt,
      actorId: input.actorId,
    },
  });
}

/**
 * The verdict currently governing a URL, or null if it has never been assessed.
 *
 * DERIVED FROM STATE — the latest row by `assessedAt` — rather than stored on a
 * mutable field. Relevance changes: the article that became this corpus's only
 * Tier 1 record was off-topic until it was the centre of the case, so how a
 * judgement moved is evidence rather than noise.
 *
 * NULL IS NOT A PASS. A URL with no assessment is unassessed, not on-mission;
 * callers must treat the two differently, exactly as UNAVAILABLE never counts as
 * VERIFIED.
 */
export async function currentMissionVerdict(url: string): Promise<{
  verdict: MissionVerdict;
  reason: string;
  author: AssessmentAuthor;
  assessedAt: Date;
} | null> {
  return prisma.scanRelevanceAssessment.findFirst({
    where: { url },
    orderBy: { assessedAt: 'desc' },
    select: { verdict: true, reason: true, author: true, assessedAt: true },
  });
}

/**
 * May this URL be submitted to Save Page Now?
 *
 * THE REVERSIBILITY ASYMMETRY. Scanning is undoable — stop tracking, supersede
 * the rows, nothing left the building. Asking the Internet Archive to crawl a
 * page is not: it is permanent, third-party, and not ours to withdraw. So the
 * irreversible act carries the strict gate.
 *
 * ON_MISSION alone is not enough; a human must confirm. And UNCLEAR permits the
 * reversible act while blocking this one — an undecided check is not a positive
 * result.
 */
export function maySubmitToSavePageNow(
  verdict: MissionVerdict | null,
  humanConfirmed: boolean,
): boolean {
  return verdict === MissionVerdict.ON_MISSION && humanConfirmed;
}
