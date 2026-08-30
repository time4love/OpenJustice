import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { EVIDENCE_TIER } from '../lib/evidenceTier';
import { extractText, analysisIsCurrent } from './thesisAnalysis';
import { deriveCallState, type CallGap } from './whistleblowerCall';
import { checkFiguresHedged, checkPublicInterestStatement, MAX_SENTENCE_LENGTH } from '../lib/publicationLanguage';
import { requireActiveSessionFor, type ActiveSessionForThesis } from './researchSessions';
import { resolveTrajectoryCitations } from './trajectoryCitation';
import { assessEvidenceInputSoundness } from './evidenceInputSoundness';
import {
  ThesisPublicationAssessorAgent,
  type ThesisPublicationAssessment,
} from './ThesisPublicationAssessorAgent';

// ---------------------------------------------------------------------------
// The thesis publication gate (docs/gf-thesis-publication-gate-dev-plan.md).
//
// Publication is a PINNED VERSION: Thesis.publishedVersionId names exactly what
// the public sees, until someone publishes again. Editing the head and
// re-running the Devil's Advocate changes nothing public.
//
// Seventeen checks, reported individually so a refusal names what is missing.
// Hard checks block. Advisory checks never block: they are recorded with the
// publication and a researcher may publish over them, and the dissent stands
// on the record — the same posture as the diff debate.
//
// Two things here look wrong at first glance and are deliberate:
//   - A LIVE whistleblower call is a HARD check (9). The call is derived from
//     gaps, so a gapless thesis produces no public appeal. Publishing is how you
//     ask for the evidence you do not have; the bar is actionability, not
//     completeness. This is not a strength gate.
//   - The hedging check (7) is per SENTENCE and deterministic. Not a model.
//   - Checks 5 and 6 read EVIDENCE mentions only, and 14/15 cover trajectory
//     mentions instead. Trajectories are deliberately NOT anchored on-chain:
//     they are derivable from snapshots that are anchored individually, and
//     anchoring a derivable thing adds nothing but the appearance of authority.
//     Requiring an anchor from them would make every trajectory-citing thesis
//     unpublishable — so do not "fix" check 5 by widening what it reads.
// ---------------------------------------------------------------------------

export type PublicationCheckId =
  | 'HEAD_VERSION'
  | 'ANALYSIS_COMPLETE'
  | 'ANALYSIS_WELL_FORMED'
  | 'CITES_EVIDENCE'
  | 'EVIDENCE_CONFIRMED_AND_ANCHORED'
  | 'EVIDENCE_TIER'
  | 'FIGURES_HEDGED'
  | 'PUBLIC_INTEREST_STATEMENT'
  | 'CALL_LIVE'
  | 'RATIONALE_SUBSTANCE'
  | 'OFFICIAL_CAPACITY'
  | 'GAP_ACTIONABILITY'
  | 'FRAMING_ATTACHED'
  | 'TRAJECTORIES_RESOLVE'
  | 'TRAJECTORIES_CURRENT'
  | 'ANALYSIS_CURRENT'
  | 'EVIDENCE_DIFF_INPUT_SOUND';

export interface PublicationCheck {
  number: number;
  id: PublicationCheckId;
  kind: 'hard' | 'advisory';
  passed: boolean;
  summary: string;
  details?: unknown;
  /**
   * Checks 6 and 17 only. False when the check passed with nothing in its
   * scope — every confirmed record in the vault already at or above the tier
   * threshold, or no cited record derived from a diff. A pass that blocks
   * nothing must say so, because a check that looks strict and blocks nothing
   * reads as protection.
   */
  binding?: boolean;
}

export interface PublicationReport {
  thesisId: string;
  headVersionId: string | null;
  publishedVersionId: string | null;
  checks: PublicationCheck[];
  hardFailures: PublicationCheckId[];
  advisoryFailures: PublicationCheckId[];
  publishable: boolean;
  /** The assessor's verdict on the rationale; advisory. Null when the model could not run. */
  verdict: 'SUPPORTS' | 'DISPUTES' | null;
  assessment: ThesisPublicationAssessment | null;
}

export interface PublicationError {
  error: 'THESIS_NOT_FOUND';
  thesisId: string;
}

let _assessor: ThesisPublicationAssessorAgent | null = null;
function getAssessor(): ThesisPublicationAssessorAgent {
  _assessor ??= new ThesisPublicationAssessorAgent();
  return _assessor;
}

const ACCEPTABLE_TIERS: readonly string[] = [EVIDENCE_TIER.SMOKING_GUN, EVIDENCE_TIER.MATERIAL];

const thesisForPublication = {
  headVersion: {
    include: {
      mentions: true,
      gapResolutions: { select: { gapIndex: true, evidenceId: true } },
    },
  },
} satisfies Prisma.ThesisInclude;

function check(
  number: number,
  id: PublicationCheckId,
  kind: 'hard' | 'advisory',
  passed: boolean,
  summary: string,
  details?: unknown,
): PublicationCheck {
  return { number, id, kind, passed, summary, ...(details === undefined ? {} : { details }) };
}

function notAssessable(number: number, id: PublicationCheckId, kind: 'hard' | 'advisory', why: string): PublicationCheck {
  return check(number, id, kind, false, `Not assessed: ${why}`);
}

/**
 * Run every check against the head version and report them individually.
 * Writes nothing. `publicInterestStatement`, when given, is evaluated in place
 * of the stored one so a researcher can test a statement before saving it.
 */
export async function assessPublication(
  thesisId: string,
  rationale: string | null,
  publicInterestStatement?: string | null,
): Promise<PublicationReport | PublicationError> {
  const thesis = await prisma.thesis.findUnique({ where: { id: thesisId }, include: thesisForPublication });
  if (!thesis) return { error: 'THESIS_NOT_FOUND', thesisId };

  const head = thesis.headVersion;
  const checks: PublicationCheck[] = [];

  // 1 — head version exists
  checks.push(
    check(1, 'HEAD_VERSION', 'hard', head !== null, head ? `Head version ${head.id}.` : 'The thesis has no version yet.'),
  );

  // 2 — analysis COMPLETE on exactly this text. Each version row carries its own
  // analysis and is created PENDING_AI with aiAnalysis null, so COMPLETE on the
  // head means the adversary spoke on this text, not on an ancestor.
  const analysisComplete = head !== null && head.status === 'COMPLETE' && head.aiAnalysis !== null;
  checks.push(
    check(
      2,
      'ANALYSIS_COMPLETE',
      'hard',
      analysisComplete,
      !head
        ? 'No head version to analyse.'
        : analysisComplete
          ? 'The Devil\'s Advocate has spoken on the head version.'
          : `The head version is ${head.status} with${head.aiAnalysis === null ? 'out' : ''} a stored analysis. Run run_ai_analysis on it.`,
    ),
  );

  // 3 + 9 — the analysis parses, and the call derived from it is live
  const call = deriveCallState(head);
  const wellFormed = call.reason !== 'ANALYSIS_SHAPE_INVALID';
  checks.push(
    check(
      3,
      'ANALYSIS_WELL_FORMED',
      'hard',
      analysisComplete && wellFormed,
      !analysisComplete
        ? 'No completed analysis to validate.'
        : wellFormed
          ? 'The stored analysis is a well-formed Devil\'s Advocate result.'
          : 'The stored analysis does not match DevilsAdvocateOutputSchema — a data defect, not an empty analysis.',
      call.reason === 'ANALYSIS_SHAPE_INVALID' ? call.details : undefined,
    ),
  );

  // 4 — cites evidence
  const citedHashes = head ? head.mentions.filter((m) => m.type === 'EVIDENCE').map((m) => m.refId) : [];
  checks.push(
    check(
      4,
      'CITES_EVIDENCE',
      'hard',
      citedHashes.length > 0,
      citedHashes.length > 0
        ? `Cites ${String(citedHashes.length)} evidence record(s).`
        : 'The narrative cites no evidence record.',
    ),
  );

  // 5 — every cited EVIDENCE record is in the vault, CONFIRMED and anchored
  // on-chain. Scoped to citedHashes, which is EVIDENCE mentions only: cited
  // trajectories are checked by 14/15 and are not anchored by design.
  const cited =
    citedHashes.length > 0
      ? await prisma.evidence.findMany({
          where: { fileHash: { in: citedHashes } },
          select: { fileHash: true, status: true, onChainTxHash: true, evidenceTier: true, summary: true },
        })
      : [];
  const byHash = new Map(cited.map((e) => [e.fileHash, e]));
  const missing = citedHashes.filter((h) => !byHash.has(h));
  const unconfirmed = cited.filter((e) => e.status !== 'CONFIRMED').map((e) => e.fileHash);
  const unanchored = cited.filter((e) => e.status === 'CONFIRMED' && e.onChainTxHash === null).map((e) => e.fileHash);
  const vaultOk = citedHashes.length > 0 && missing.length === 0 && unconfirmed.length === 0 && unanchored.length === 0;
  checks.push(
    check(
      5,
      'EVIDENCE_CONFIRMED_AND_ANCHORED',
      'hard',
      vaultOk,
      citedHashes.length === 0
        ? 'Nothing cited to verify.'
        : vaultOk
          ? 'Every cited record is in the vault, CONFIRMED and anchored on-chain.'
          : [
              missing.length > 0 ? `${String(missing.length)} not in the vault` : null,
              unconfirmed.length > 0 ? `${String(unconfirmed.length)} not CONFIRMED` : null,
              unanchored.length > 0 ? `${String(unanchored.length)} CONFIRMED without an on-chain tx` : null,
            ]
              .filter(Boolean)
              .join('; ') + '. A thesis cannot be public on evidence the vault has not made public.',
      vaultOk ? undefined : { missing, unconfirmed, unanchored },
    ),
  );

  // 6 — tier, with an honest statement of whether it currently binds
  const belowTier = cited.filter((e) => !ACCEPTABLE_TIERS.includes(e.evidenceTier)).map((e) => ({
    fileHash: e.fileHash,
    evidenceTier: e.evidenceTier,
  }));
  const confirmedBelowThresholdInVault = await prisma.evidence.count({
    where: { status: 'CONFIRMED', evidenceTier: { notIn: [...ACCEPTABLE_TIERS] } },
  });
  const binding = confirmedBelowThresholdInVault > 0;
  checks.push({
    ...check(
      6,
      'EVIDENCE_TIER',
      'hard',
      citedHashes.length > 0 && belowTier.length === 0,
      citedHashes.length === 0
        ? 'Nothing cited to tier.'
        : belowTier.length > 0
          ? `${String(belowTier.length)} cited record(s) below Tier 2.`
          : binding
            ? 'All cited evidence is at or above Tier 2.'
            : 'All cited evidence is at or above Tier 2 — NON-BINDING: every confirmed record in the vault is at or above Tier 2, so this check currently blocks nothing.',
      belowTier.length > 0 ? belowTier : undefined,
    ),
    binding,
  });

  // 7 — per-sentence hedging beside every named figure. Names are EVERY
  // KeyFigure the system knows, not just the ones this thesis tagged: typing a
  // name as plain text is the easiest way to write an unhedged allegation, and
  // a check that only knew the tagged names would wave it through.
  if (head) {
    const known = await prisma.keyFigure.findMany({ select: { name: true } });
    const figureNames = [
      ...new Set([...known.map((k) => k.name), ...head.mentions.filter((m) => m.type === 'KEY_FIGURE').map((m) => m.refId)]),
    ];
    const hedge = checkFiguresHedged(head.userContent, figureNames);
    const tooLong = hedge.unhedged.filter((s) => s.tooLong).length;
    const limits = ` Checked against ${String(figureNames.length)} known figure name(s); a name the system has never recorded is not detected.`;
    checks.push(
      check(
        7,
        'FIGURES_HEDGED',
        'hard',
        hedge.passed,
        (hedge.passed
          ? hedge.sentences.length === 0
            ? 'No sentence names a key figure.'
            : `Every one of ${String(hedge.sentences.length)} sentence(s) naming a key figure carries a hedge marker.`
          : `${String(hedge.unhedged.length)} sentence(s) name a key figure with no hedge marker in that sentence.` +
            (tooLong > 0
              ? ` ${String(tooLong)} of them exceed ${String(MAX_SENTENCE_LENGTH)} characters without terminal punctuation and cannot be judged per sentence — add punctuation.`
              : '')) + limits,
        hedge.passed ? undefined : hedge.unhedged,
      ),
    );
  } else {
    checks.push(notAssessable(7, 'FIGURES_HEDGED', 'hard', 'no head version.'));
  }

  // 8 — public interest statement
  const statement = publicInterestStatement === undefined ? thesis.publicInterestStatement : publicInterestStatement;
  const pis = checkPublicInterestStatement(statement);
  checks.push(
    check(8, 'PUBLIC_INTEREST_STATEMENT', 'hard', pis.passed, pis.passed ? 'Public-interest statement present.' : pis.reason ?? ''),
  );

  // 9 — the Call for Whistleblowers is live
  checks.push(
    check(
      9,
      'CALL_LIVE',
      'hard',
      call.isLive,
      call.isLive
        ? `The call is live with ${String(call.gaps.length)} gap(s).`
        : call.reason === 'NO_GAPS'
          ? 'The analysis found no evidence gaps, so no public appeal would be published. Publishing is how the thesis asks for the evidence it lacks; without an ask there is nothing to publish.'
          : `The call is not live: ${call.reason}.`,
    ),
  );

  // 10-12 — the model, once, when there is something to assess
  let assessment: ThesisPublicationAssessment | null = null;
  const gaps: CallGap[] = call.isLive ? call.gaps : [];
  if (head && analysisComplete && wellFormed) {
    assessment = await getAssessor().assess({
      thesisText: extractText(head.userContent),
      figureNames: head.mentions.filter((m) => m.type === 'KEY_FIGURE').map((m) => m.refId),
      evidence: cited.map((e) => ({ fileHash: e.fileHash, evidenceTier: e.evidenceTier, summary: e.summary })),
      gaps: gaps.map((g) => ({ gapIndex: g.gapIndex, description: g.description, suggestedSearch: g.suggestedSearch })),
      publicInterestStatement: statement ?? null,
      rationale,
    });
  }

  const rationaleGiven = (rationale ?? '').trim() !== '';
  if (!rationaleGiven) {
    checks.push(
      check(
        10,
        'RATIONALE_SUBSTANCE',
        'hard',
        false,
        'No rationale supplied. publish_thesis requires one stating what the thesis claims, what the cited evidence supports, and where it stops.',
      ),
    );
  } else if (!assessment) {
    checks.push(notAssessable(10, 'RATIONALE_SUBSTANCE', 'hard', 'requires a head version with a well-formed, completed analysis.'));
  } else {
    checks.push(
      check(
        10,
        'RATIONALE_SUBSTANCE',
        'hard',
        assessment.rationaleHasSubstance,
        assessment.rationaleHasSubstance
          ? `The rationale is reviewable. Assessor verdict: ${assessment.verdict} (advisory).`
          : 'The rationale is not reviewable — see substanceGaps.',
        assessment.rationaleHasSubstance
          ? assessment.verdict === 'DISPUTES'
            ? { objection: assessment.objection }
            : undefined
          : assessment.substanceGaps,
      ),
    );
  }

  if (!assessment) {
    checks.push(notAssessable(11, 'OFFICIAL_CAPACITY', 'advisory', 'requires a head version with a well-formed, completed analysis.'));
    checks.push(notAssessable(12, 'GAP_ACTIONABILITY', 'advisory', 'requires a head version with a well-formed, completed analysis.'));
  } else {
    checks.push(
      check(
        11,
        'OFFICIAL_CAPACITY',
        'advisory',
        assessment.officialCapacityOk,
        assessment.officialCapacityOk
          ? 'Every named figure is discussed in official capacity.'
          : `${String(assessment.characterClaims.length)} sentence(s) make a character or motive claim.`,
        assessment.officialCapacityOk ? undefined : assessment.characterClaims,
      ),
    );
    const notActionable = assessment.gapActionability.filter((g) => !g.namesDocument || !g.namesHolder);
    checks.push(
      check(
        12,
        'GAP_ACTIONABILITY',
        'advisory',
        gaps.length > 0 && notActionable.length === 0,
        gaps.length === 0
          ? 'No gaps to assess.'
          : notActionable.length === 0
            ? 'Every gap names a document and a holder.'
            : `${String(notActionable.length)} of ${String(gaps.length)} gap(s) do not name both a document and a holder.`,
        notActionable.length > 0 ? notActionable : undefined,
      ),
    );
  }

  // 13 — framing session attached
  const framing = await prisma.researchSession.findFirst({
    where: { thesisId, events: { some: { type: 'THESIS_ATTACHED' } } },
    select: { id: true, question: true },
  });
  checks.push(
    check(
      13,
      'FRAMING_ATTACHED',
      'advisory',
      framing !== null,
      framing
        ? `Framing session ${framing.id} is attached.`
        : 'No framing session is attached — the reasoning that chose this framing is not on record.',
      framing ?? undefined,
    ),
  );

  // 14 + 15 — cited trajectories. A trajectory citation names a
  // ClaimTrajectory.id, which pins the detection pass, so the two questions are
  // separate: does the cited pass still EXIST (hard), and does the newest pass
  // still AGREE with it (advisory)?
  const citedTrajectoryIds = head
    ? head.mentions.filter((m) => m.type === 'CLAIM_TRAJECTORY').map((m) => m.refId)
    : [];
  const trajectories = await resolveTrajectoryCitations(citedTrajectoryIds);

  checks.push(
    check(
      14,
      'TRAJECTORIES_RESOLVE',
      'hard',
      trajectories.missing.length === 0,
      citedTrajectoryIds.length === 0
        ? 'No trajectory cited.'
        : trajectories.missing.length === 0
          ? `All ${String(citedTrajectoryIds.length)} cited trajectory citation(s) resolve to a stored detection pass. ` +
            'Trajectories are not anchored on-chain by design — they are derived from snapshots that are ' +
            'anchored individually.'
          : `${String(trajectories.missing.length)} cited trajectory id(s) no longer resolve. The claims resting ` +
            'on them have nothing behind them.',
      trajectories.missing.length > 0 ? { missing: trajectories.missing } : undefined,
    ),
  );

  const superseded = trajectories.resolved.flatMap((t) =>
    t.currency.state === 'RECOMPUTED_DISAGREES'
      ? [{ trajectoryId: t.id, claimText: t.claimText.slice(0, 120), difference: t.currency.difference }]
      : [],
  );
  const notFollowed = trajectories.resolved.filter((t) => t.currency.state === 'NOT_FOLLOWED_BY_LATEST').length;
  checks.push(
    check(
      15,
      'TRAJECTORIES_CURRENT',
      'advisory',
      superseded.length === 0,
      citedTrajectoryIds.length === 0
        ? 'No trajectory cited.'
        : superseded.length > 0
          ? `${String(superseded.length)} cited trajectory(ies) are contradicted by a newer detection pass. ` +
            'Advisory: a superseded trajectory is a fact about the archive changing, not a defect in the ' +
            'thesis. The citation still resolves to the pass that was cited; re-cite only if the newer ' +
            'reading is the one the argument needs.'
          : 'Every cited trajectory still agrees with the newest detection pass.' +
            (notFollowed > 0
              ? ` ${String(notFollowed)} is no longer followed by the newest pass at all — candidate discovery ` +
                'stopped surfacing the claim, which is silence rather than disagreement.'
              : ''),
      superseded.length > 0 ? superseded : undefined,
    ),
  );

  // 16 — the stored critique still answers the facts it argued against.
  //
  // Check 2 asks whether an analysis EXISTS. That is a different question, and
  // treating it as the same one is how a critique came to outlive its inputs:
  // status is set to PENDING_AI only when a version is CREATED, so an analysis
  // survived corrected evidence summaries, new detection passes, and changes to
  // what the critic is given, with check 2 passing throughout.
  //
  // Hard, because the failure it prevents is publishing a document whose
  // adversarial review argued against something else — and the remedy is one
  // call. Computed by comparing the fingerprint of the critic's actual input, so
  // the gate and the runner cannot disagree about what that input is.
  const analysisCurrent =
    head === null ? false : ((await analysisIsCurrent(head.id, head.userContent)) ?? false);
  checks.push(
    check(
      16,
      'ANALYSIS_CURRENT',
      'hard',
      analysisCurrent,
      !head
        ? 'No head version to analyse.'
        : analysisCurrent
          ? 'The stored critique answers the evidence, trajectories and text as they are now.'
          : 'The stored critique was argued against a different input — an evidence summary, a ' +
            'detection pass or the cited text has changed since it ran, or it predates input ' +
            'fingerprinting. Run run_ai_analysis to re-argue it against what is there now.',
    ),
  );

  // 17 — the INPUT behind every cited record, not the record's status.
  //
  // Checks 5 and 6 ask whether a cited record is CONFIRMED, anchored and at
  // tier. None of the three asks whether the change it reports happened. A
  // record whose diff the archived documents REFUTE satisfies all of them, and
  // one did: an anchored, CONFIRMED record passing all sixteen checks, whose
  // summary asserts a safety presentation was added on a date the raw archive
  // shows it was already there.
  //
  // Level 5 has refused to PROMOTE such a diff since its gate landed. This is
  // the same rule at the other end — records promoted before that gate existed
  // are still citable, and a diff can become CONTRADICTED after promotion.
  //
  // HARD, and failing on four of the five states rather than on refutation
  // alone. Promotion may proceed on an unchecked diff because unchecked is not
  // refuted; publication may not, because publishing asserts the change in
  // public. See `unsoundReasonFor`.
  const soundness = await assessEvidenceInputSoundness(citedHashes);
  const documentScope =
    soundness.outOfScope > 0
      ? ` ${String(soundness.outOfScope)} cited record(s) are not derived from a diff and are not ` +
        'covered here: DOCUMENT evidence has no snapshot-derived input and no soundness check at all.'
      : '';
  checks.push({
    ...check(
      17,
      'EVIDENCE_DIFF_INPUT_SOUND',
      'hard',
      soundness.passed,
      (!soundness.binding
        ? 'No cited record is derived from a diff — NON-BINDING: this check judges the archived ' +
          'documents behind diff-derived evidence, and there is none to judge.'
        : soundness.passed
          ? `All ${String(soundness.inScope)} diff-derived cited record(s) rest on a change the ` +
            'archived documents support.'
          : `${String(soundness.unsound.length)} of ${String(soundness.inScope)} diff-derived cited ` +
            'record(s) rest on an input the documents do not support, or that the platform has no ' +
            'current answer about.') + documentScope,
      soundness.unsound.length > 0
        ? soundness.unsound.map((r) => ({
            fileHash: r.fileHash,
            urlVersionDiffId: r.urlVersionDiffId,
            state: r.survival?.state ?? 'DIFF_NOT_LOADED',
            reason: r.unsoundReason,
          }))
        : undefined,
    ),
    binding: soundness.binding,
  });

  const hardFailures = checks.filter((c) => c.kind === 'hard' && !c.passed).map((c) => c.id);
  const advisoryFailures = checks.filter((c) => c.kind === 'advisory' && !c.passed).map((c) => c.id);

  return {
    thesisId,
    headVersionId: head?.id ?? null,
    publishedVersionId: thesis.publishedVersionId,
    checks,
    hardFailures,
    advisoryFailures,
    publishable: hardFailures.length === 0,
    verdict: assessment?.verdict ?? null,
    assessment,
  };
}

export type PublishResult =
  | {
      published: true;
      thesisId: string;
      publishedVersionId: string;
      publishedAt: Date;
      /** The session the publication was recorded on — now CLOSED by it. */
      sessionId: string;
      /** Always true on success: publishing closes the session it happened in. */
      sessionClosed: true;
      overObjection: boolean;
      advisoryFailures: PublicationCheckId[];
      report: PublicationReport;
    }
  | { published: false; refusedBy: PublicationCheckId[]; sessionId: string; report: PublicationReport }
  | { published: false; error: Exclude<ActiveSessionForThesis, { ok: true }>['error']; explanation: string; activeSession?: unknown }
  | PublicationError;

/**
 * Publish the head version: run every check, refuse with the full list, or pin
 * the version and record the act on the active session.
 *
 * The rationale and the assessment are written to the session whether or not
 * publication succeeds — an argument that was made and refused is still part
 * of the record, exactly as in the diff debate.
 */
export async function publishThesis(
  thesisId: string,
  researcherId: string,
  rationale: string,
  publicInterestStatement?: string,
): Promise<PublishResult> {
  const session = await requireActiveSessionFor(researcherId, thesisId);
  if (!session.ok) {
    return { published: false, ...(session.error === 'NO_ACTIVE_SESSION' ? {} : { activeSession: session.activeSession }), error: session.error, explanation: session.explanation };
  }

  // The statement is part of the thesis, not of this attempt: saved even if the
  // attempt is refused, so the next one does not have to repeat it.
  if (publicInterestStatement !== undefined) {
    const updated = await prisma.thesis.updateMany({
      where: { id: thesisId },
      data: { publicInterestStatement },
    });
    if (updated.count === 0) return { error: 'THESIS_NOT_FOUND', thesisId };
  }

  const report = await assessPublication(thesisId, rationale);
  if ('error' in report) return report;

  await prisma.researchSessionEvent.create({
    data: { sessionId: session.sessionId, type: 'PUBLICATION_RATIONALE', description: rationale, refId: report.headVersionId },
  });
  await prisma.researchSessionEvent.create({
    data: {
      sessionId: session.sessionId,
      type: 'PUBLICATION_ASSESSED',
      description: JSON.stringify({ checks: report.checks, assessment: report.assessment }),
      refId: report.headVersionId,
    },
  });

  if (!report.publishable || report.headVersionId === null) {
    return { published: false, refusedBy: report.hardFailures, sessionId: session.sessionId, report };
  }

  const overObjection = report.verdict === 'DISPUTES';
  const publishedAt = new Date();
  const advisoryNote =
    report.advisoryFailures.length > 0 ? ` Advisory checks not met: ${report.advisoryFailures.join(', ')}.` : '';

  // Publishing CLOSES the session, in the same transaction that pins the version.
  //
  // Publication is the terminal act of a thesis session: the rationale, the
  // assessment and the publish are all recorded on it, and there is nothing
  // further the session is for. Leaving it open is not merely untidy now that a
  // thesis may be held by ONE researcher at a time — a published thesis would
  // stay locked to its author indefinitely, so nobody could open a session to
  // revise it, correct it, or retract it until somebody remembered to close work
  // that had already finished.
  //
  // Inside the transaction on purpose: a session must never be closed by a
  // publication that did not happen. Either the version is pinned and the
  // session is closed, or neither.
  //
  // Deliberately NOT symmetric with unpublish. Retraction is usually the START
  // of remedial work, so closing there would take the session away exactly when
  // it is needed.
  //
  // Publishing a revision closes the session too. An explicit new session per
  // publication cycle is better provenance than one session spanning several
  // publications — create_research_session reopens in one call.
  await prisma.$transaction([
    prisma.thesis.update({
      where: { id: thesisId },
      data: { publishedVersionId: report.headVersionId, publishedAt, publishedById: researcherId },
    }),
    prisma.researchSessionEvent.create({
      data: {
        sessionId: session.sessionId,
        type: 'THESIS_PUBLISHED',
        refId: report.headVersionId,
        description:
          (overObjection
            ? 'Published over a sustained objection from the assessor.'
            : 'Published with the assessor in agreement.') + advisoryNote,
      },
    }),
    prisma.researchSessionEvent.create({
      data: {
        sessionId: session.sessionId,
        type: 'SESSION_CLOSED',
        description: 'Closed automatically: the thesis was published, which is what this session was for.',
      },
    }),
    prisma.researchSession.update({
      where: { id: session.sessionId },
      data: { status: 'CLOSED', closedAt: publishedAt },
    }),
  ]);

  return {
    published: true,
    thesisId,
    publishedVersionId: report.headVersionId,
    publishedAt,
    sessionId: session.sessionId,
    /** The session was closed by this publication. Said plainly so the caller does not go looking for it. */
    sessionClosed: true,
    overObjection,
    advisoryFailures: report.advisoryFailures,
    report,
  };
}

export type UnpublishResult =
  | { unpublished: true; thesisId: string; previouslyPublishedVersionId: string; recordedOnSessionId: string | null }
  | { unpublished: false; error: 'NOT_PUBLISHED'; thesisId: string }
  | PublicationError;

/**
 * Unpublish: set the pin to null. Deletes nothing; the version stays and can be
 * published again. Requires no session — retraction is the safe direction and
 * must never wait on one. The reason is recorded on the caller's active session
 * on this thesis if there is one, otherwise on the session that published.
 */
export async function unpublishThesis(thesisId: string, researcherId: string, reason: string): Promise<UnpublishResult> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, publishedVersionId: true },
  });
  if (!thesis) return { error: 'THESIS_NOT_FOUND', thesisId };
  if (thesis.publishedVersionId === null) return { unpublished: false, error: 'NOT_PUBLISHED', thesisId };

  const versionId = thesis.publishedVersionId;

  const active = await requireActiveSessionFor(researcherId, thesisId);
  const publishing = active.ok
    ? null
    : await prisma.researchSessionEvent.findFirst({
        where: { type: 'THESIS_PUBLISHED', refId: versionId },
        orderBy: { createdAt: 'desc' },
        select: { sessionId: true },
      });
  const sessionId = active.ok ? active.sessionId : publishing?.sessionId ?? null;

  await prisma.$transaction([
    prisma.thesis.update({
      where: { id: thesisId },
      data: { publishedVersionId: null, publishedAt: null, publishedById: null },
    }),
    ...(sessionId
      ? [
          prisma.researchSessionEvent.create({
            data: {
              sessionId,
              type: 'THESIS_UNPUBLISHED',
              refId: versionId,
              description: `Unpublished version ${versionId}. Reason: ${reason}`,
            },
          }),
        ]
      : []),
  ]);

  return { unpublished: true, thesisId, previouslyPublishedVersionId: versionId, recordedOnSessionId: sessionId };
}
