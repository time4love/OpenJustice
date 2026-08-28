import { prisma } from '../lib/prisma';
import { AssessmentAuthor } from '@prisma/client';

/**
 * The one place a judgement about a URL becomes stored state.
 *
 * Two gates run over a submitted URL and they answer DIFFERENT QUESTIONS:
 *
 *   MISSION  is this within the platform's stated purpose?  — reads SUBJECT MATTER
 *   SUBJECT  is this page about a named private individual? — reads WHO IS IN IT
 *
 * One table, because the rule for RECORDING a judgement — author, model, version,
 * criterion hash, what the model was shown, who overrode it — is one rule, and two
 * tables would be two implementations of it. The verdict vocabularies stay
 * separate and DISJOINT, enforced by a database CHECK.
 */

/** Mission verdicts. Uncertainty resolves toward ADMITTING. */
export const MISSION_VERDICTS = [
  'ON_MISSION',
  'OFF_MISSION',
  'UNCLEAR',
  /// Nothing could be read, so nothing was judged — a verdict about the CHECK.
  'UNREADABLE',
] as const;
export type MissionVerdict = (typeof MISSION_VERDICTS)[number];

/**
 * A verdict and its provenance, as a DISCRIMINATED UNION on BOTH axes.
 *
 * `checkType` pins the vocabulary and `author` pins the provenance, so a mission
 * verdict under a subject check, or a MODEL row missing its prompt hash, does not
 * compile. The database carries both rules as CHECK constraints, because a check
 * in one language guards a table any other path can write.
 */
type Provenance =
  | {
      author: 'MODEL';
      model: string;
      agentVersion: string;
      promptHash: string;
      contentChars: number;
      contentTruncated: boolean;
      submitterId?: string | undefined;
    }
  | { author: 'HUMAN'; actorId: string };

export type UrlAssessmentInput = Provenance & {
  url: string;
  verdict: MissionVerdict;
  reason: string;
  assessedAt: Date;
};

export async function recordUrlAssessment(input: UrlAssessmentInput): Promise<void> {
  // APPEND-ONLY. A human overturning a model verdict writes a NEW ROW; the
  // model's verdict stays on the record beside the correction, which is what
  // makes the filter auditable rather than merely overridable.
  const common = {
    url: input.url,
    verdict: input.verdict,
    reason: input.reason,
    assessedAt: input.assessedAt,
  };

  if (input.author === 'MODEL') {
    await prisma.scanRelevanceAssessment.create({
      data: {
        ...common,
        author: AssessmentAuthor.MODEL,
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
    data: { ...common, author: AssessmentAuthor.HUMAN, actorId: input.actorId },
  });
}

/**
 * The verdict currently governing a URL for one check, or null if never assessed.
 *
 * DERIVED FROM STATE — the latest row by `assessedAt` — rather than stored on a
 * mutable field. Relevance changes: production's only Tier 1 record is a media
 * article that was off-topic until it was the centre of the case.
 *
 * NULL IS NOT A PASS. Never assessed is not on-mission, exactly as UNAVAILABLE
 * never counts as VERIFIED.
 */
export async function currentVerdict(url: string): Promise<string | null> {
  const row = await prisma.scanRelevanceAssessment.findFirst({
    where: { url },
    orderBy: { assessedAt: 'desc' },
    select: { verdict: true },
  });
  return row?.verdict ?? null;
}
