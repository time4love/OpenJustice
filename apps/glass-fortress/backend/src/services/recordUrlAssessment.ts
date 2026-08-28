import { prisma } from '../lib/prisma';
import { AssessmentAuthor, UrlAssessmentType } from '@prisma/client';

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
export const MISSION_VERDICTS = ['ON_MISSION', 'OFF_MISSION', 'UNCLEAR'] as const;
export type MissionVerdict = (typeof MISSION_VERDICTS)[number];

/**
 * Subject verdicts. Uncertainty resolves toward REQUIRING A HUMAN — the opposite
 * of the mission gate, and the reason the third value is not called `UNCLEAR`.
 *
 * The mission gate is deciding whether to spend a scan: a false rejection blocks a
 * legitimate investigation, a false approval costs one scan. This gate is deciding
 * whether to make a page about a private person permanent: a false negative
 * performs an irreversible act on someone who did not choose it, a false positive
 * costs somebody a click.
 *
 * `NEEDS_HUMAN` says the consequence rather than the epistemic state, so the two
 * gates cannot be made "consistent" by someone who notices they both said
 * UNCLEAR — and, sharing one column, so that a query filtering on a verdict never
 * returns rows meaning *proceed* beside rows meaning *stop*.
 */
export const SUBJECT_VERDICTS = [
  'NO_PRIVATE_INDIVIDUAL',
  'NAMED_PRIVATE_INDIVIDUAL',
  'NEEDS_HUMAN',
] as const;
export type SubjectVerdict = (typeof SUBJECT_VERDICTS)[number];

/**
 * A verdict and its provenance, as a DISCRIMINATED UNION on BOTH axes.
 *
 * `checkType` pins the vocabulary and `author` pins the provenance, so a mission
 * verdict under a subject check, or a MODEL row missing its prompt hash, does not
 * compile. The database carries both rules as CHECK constraints, because a check
 * in one language guards a table any other path can write.
 */
type Verdicts =
  | { checkType: 'MISSION'; verdict: MissionVerdict }
  | { checkType: 'SUBJECT'; verdict: SubjectVerdict };

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

export type UrlAssessmentInput = Verdicts &
  Provenance & { url: string; reason: string; assessedAt: Date };

export async function recordUrlAssessment(input: UrlAssessmentInput): Promise<void> {
  // APPEND-ONLY. A human overturning a model verdict writes a NEW ROW; the
  // model's verdict stays on the record beside the correction, which is what
  // makes the filter auditable rather than merely overridable.
  const common = {
    url: input.url,
    checkType:
      input.checkType === 'MISSION' ? UrlAssessmentType.MISSION : UrlAssessmentType.SUBJECT,
    verdict: input.verdict,
    reason: input.reason,
    assessedAt: input.assessedAt,
  };

  if (input.author === 'MODEL') {
    await prisma.urlAssessment.create({
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
  await prisma.urlAssessment.create({
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
export async function currentVerdict(
  url: string,
  checkType: 'MISSION' | 'SUBJECT',
): Promise<string | null> {
  const row = await prisma.urlAssessment.findFirst({
    where: {
      url,
      checkType:
        checkType === 'MISSION' ? UrlAssessmentType.MISSION : UrlAssessmentType.SUBJECT,
    },
    orderBy: { assessedAt: 'desc' },
    select: { verdict: true },
  });
  return row?.verdict ?? null;
}

/** Whether Save Page Now may run, and whether a human must say yes first. */
export type SpnDecision =
  | { allowed: false; reason: string }
  | { allowed: true; humanConfirmationRequired: boolean };

/**
 * May this URL be submitted to Save Page Now?
 *
 * THE REVERSIBILITY ASYMMETRY. Scanning is undoable — stop tracking, supersede the
 * rows, nothing left the building. Asking the Internet Archive to crawl a page is
 * not: permanent, third-party, not ours to withdraw. So the gates differ.
 *
 * ON_MISSION is a PRECONDITION, not the question. Relevance is not what SPN adds:
 * the page is already public, and SPN makes it durable rather than visible. The
 * harm case has one shape — someone who published something about themselves and
 * later wants it gone — and the mission gate cannot see that axis at all, because
 * it reads subject matter rather than who is in the page.
 *
 * A HUMAN IS NOT ASKED EVERY TIME, deliberately. An institutional or press page on
 * Covid-19 health policy is the whole point of the platform; permanence harms
 * nobody, SPN only fires when the Archive holds nothing, and asking on every
 * request trains a reader to stop reading. That is this project's own lesson that
 * a gate which cries wolf gets disabled.
 *
 * MISSION `UNCLEAR` REFUSES OUTRIGHT, even with a human yes — and that is the
 * assertion worth guarding hardest. A human may authorise permanence; a human may
 * not authorise relevance. Without it the subject gate becomes a way to talk past
 * the first gate entirely.
 */
export function savePageNowDecision(
  mission: string | null,
  subject: string | null,
): SpnDecision {
  if (mission !== 'ON_MISSION') {
    return {
      allowed: false,
      reason:
        mission === null
          ? 'This URL has no mission assessment. Never assessed is not on-mission.'
          : `Mission verdict is ${mission}. Only ON_MISSION may be submitted, and a human ` +
            'cannot authorise relevance.',
    };
  }
  if (subject === null) {
    return { allowed: false, reason: 'This URL has no subject assessment.' };
  }
  if (subject === 'NO_PRIVATE_INDIVIDUAL') {
    return { allowed: true, humanConfirmationRequired: false };
  }
  // NAMED_PRIVATE_INDIVIDUAL and NEEDS_HUMAN both land here: the uncertain case
  // resolves toward asking, because the cost of being wrong falls on someone who
  // did not choose it.
  return { allowed: true, humanConfirmationRequired: true };
}
