import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { Prisma, ThesisGapDecision } from '@prisma/client';
import { headFingerprint } from '../../services/criticMaterial';
import { currentAnalysis, gapList, history, unargued, type GapEntry } from '../../services/thesisPredicates';
import { getResearcherId } from '../../context/researcherContext';
import { publicationState, thesisState, type ThesisState } from '../../lib/thesisView';
import { handlesOf } from '../../services/publishedThesis';
import { voicesOf, type ModelVoice, type Researcher, type Turn, type Voices } from '../../services/thesisTranscript';
import { argued } from '../../services/evidencePredicates';
import { resolveTrajectoryCitations, type TrajectoryCurrency } from '../../services/trajectoryCitation';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// get_thesis_context({ thesisId, since? })
// GATED read · not paid — docs/gf-thesis-flows.md A4 :1476–:1479, §9 :971–:1006.
//
// "The thesis · HEAD and PUBLISHED with their texts and resolved mentions · UNARGUED · GAP_LIST with
// decisions in force · CURRENT_ANALYSIS or STALE/NONE · the framings · HISTORY(t), optionally since a date."
//
// A GATED READ'S HANDLER ASKS NO IDENTITY (interaction A5 :1071–:1072): the gate is the route's. Any
// researcher reads any thesis's working state — "gated from the public, not from colleagues" (§9 :1003).
// It refuses NO_THESIS and nothing else, writes nothing and spends nothing.
//
// `since` IS COINED (REVIEW, R41 7.3 round 2) — A4's input line names no parameter for "since a date".
//
// UNARGUED, GAP_LIST AND HISTORY ARE CALLED, never re-derived here. THE ANALYSIS (A4 :1478, thesis step 22): the
// fingerprint of HEAD from `services/criticMaterial.headFingerprint` — the ONE loader `run_analysis` refuses on, so the
// read and the refusal cannot disagree — and CURRENT_ANALYSIS CALLED over HEAD's analyses. Four states: CURRENT (with
// the analysis), STALE (analyses exist, none carries the fingerprint), NONE (never run, or no head), and
// AWAITING_DERIVATION naming the cited record whose CURRENT is undefined (REVIEW's Q7, R48 §6-7). Step 20's throw on
// an analysis row (R47 §6-R15) is gone with the writer it waited for.
// ---------------------------------------------------------------------------

export const getThesisContextSchema = {
  thesisId: z.string().describe('The thesis to read — any researcher may read any thesis'),
  // `z.iso.datetime` — zod's successor to the deprecated `z.string().datetime`, the same check.
  since: z.iso
    .datetime({ offset: true })
    .optional()
    .describe('ISO-8601. When given, HISTORY lists only what happened AFTER this instant — "what happened since"'),
};

export interface GetThesisContextInput {
  thesisId: string;
  since?: string;
}

interface ResolvedMention {
  kind: 'EVIDENCE' | 'TRAJECTORY';
  name: string;
  pin: string | null;
  argued: boolean;
  /** TRAJECTORY only — whether the cited pass still exists (A3 TRAJECTORIES_RESOLVE), said, never omitted. */
  resolves?: boolean;
  /** TRAJECTORY only, when it resolves — the cited pass's standing against the newest one, through the one resolver. */
  currency?: TrajectoryCurrency;
}

interface VersionView {
  versionId: string;
  /** The author, as a handle and a `mine` — never an id on the wire (A4 :1476). */
  by: Researcher;
  text: string;
  claim: string;
  contentHash: string;
  createdAt: Date;
  mentions: ResolvedMention[];
}

type AnalysisState =
  | { state: 'NONE'; fingerprint?: string }
  | { state: 'AWAITING_DERIVATION'; name: string }
  | {
      state: 'CURRENT';
      fingerprint: string;
      analysisId: string;
      runAt: Date;
      /** The model that ran, its prompt version and who spent the call — A2 :1317, as one value. */
      by: ModelVoice;
      opinion: Prisma.JsonValue;
    }
  | { state: 'STALE'; fingerprint: string; latest: { analysisId: string; inputFingerprint: string; runAt: Date } };

interface ThesisContext {
  thesis: {
    thesisId: string;
    provision: string | null;
    by: Researcher;
    headVersionId: string | null;
    publishedVersionId: string | null;
    publishedAt: Date | null;
    publicInterestStatement: string | null;
    createdAt: Date;
    /** The four words of ui §11 :398–:399, through `thesisState` — the SAME union `list_theses` answers. */
    state: ThesisState;
  };
  head: VersionView | null;
  published: VersionView | null;
  unargued: string[];
  /**
   * GAP_LIST with its decision in force — and the decision's `researcherId` PROJECTED OUT (M5, 2026-09-20).
   *
   * A4 :1476 spells `inForce` as "the ThesisGapDecision row", and the row carries the column; a walk of the
   * serialised body found it to be the ONLY raw researcher id left on the wire. The same clause says a
   * researcher is "NEVER an id on the wire", and `by: P` beside it already carries the attribution — so the
   * row travels without the one field the other rule forbids, and nothing is lost.
   */
  gapList: (Omit<GapEntry, 'inForce'> & { inForce: Omit<ThesisGapDecision, 'researcherId'>; by: Researcher })[];
  analysis: AnalysisState;
  framings: { framingId: string; question: string; provision: string | null; by: Researcher; createdAt: Date }[];
  history: Turn[];
}

/** THE ONE FUNCTION behind the tool and `GET /api/research/theses/:id` (UI-3). */
export async function thesisContextOf(input: GetThesisContextInput): Promise<ThesisContext | Refusal<'NO_THESIS'>> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    select: {
      id: true,
      provision: true,
      createdById: true,
      headVersionId: true,
      publishedVersionId: true,
      publishedAt: true,
      publicInterestStatement: true,
      createdAt: true,
    },
  });
  if (thesis === null) {
    return refusal('NO_THESIS', `No thesis ${input.thesisId}. list_theses names the theses you can read.`);
  }

  const decisions = await prisma.thesisGapDecision.findMany({ where: { thesisId: thesis.id } });
  const framings = await prisma.framing.findMany({
    where: { thesisId: thesis.id },
    select: { id: true, question: true, provision: true, researcherId: true, createdAt: true },
  });
  const versions = await prisma.thesisVersion.findMany({
    where: { thesisId: thesis.id },
    select: { id: true, createdById: true, createdAt: true },
  });
  const withdrawals = await prisma.withdrawal.findMany({
    where: { thesisId: thesis.id },
    select: { createdAt: true, reason: true },
  });

  // EVERY RESEARCHER THIS ANSWER NAMES, in one query, resolved to a handle. `by: P` replaces `createdById` and
  // `researcherId` on every arm of this read (A4 :1476: "a researcher — NEVER an id on the wire"), because
  // §4 :167 bars an id from being rendered and a page cannot show what it is not given.
  const handles = await handlesOf([
    thesis.createdById,
    ...framings.map((f) => f.researcherId),
    ...versions.map((v) => v.createdById),
    ...decisions.map((d) => d.researcherId),
  ]);
  const caller = getResearcherId();
  const voices = voicesOf(handles, caller, thesis.id);

  const head = thesis.headVersionId === null ? null : await versionView(thesis.id, thesis.headVersionId, voices);
  const published =
    thesis.publishedVersionId === null ? null : await versionView(thesis.id, thesis.publishedVersionId, voices);

  const analysed = head === null ? null : await analysisOf(thesis.id, head.view.versionId, voices);
  const analysis = analysed?.state ?? ({ state: 'NONE' } as const);

  return {
    thesis: {
      thesisId: thesis.id,
      provision: thesis.provision,
      by: voices.researcher(thesis.createdById),
      headVersionId: thesis.headVersionId,
      publishedVersionId: thesis.publishedVersionId,
      publishedAt: thesis.publishedAt,
      publicInterestStatement: thesis.publicInterestStatement,
      createdAt: thesis.createdAt,
      // THE SAME UNION `list_theses` ANSWERS, from the same function — one spelling of what a thesis's state
      // is, so the list and the working view can never disagree (A4 :1429, :1476).
      state: thesisState(
        publicationState(
          {
            headVersionId: thesis.headVersionId,
            publishedVersionId: thesis.publishedVersionId,
            publishedAt: thesis.publishedAt,
            publishedBy: null,
          },
          versions,
        ),
        latestOf(withdrawals),
      ),
    },
    head: head?.view ?? null,
    published: published?.view ?? null,
    unargued: head === null ? [] : unargued({ thesisId: thesis.id }, head.cited),
    gapList: gapList(decisions, thesis.id, head?.view.mentions.map((m) => m.name) ?? []).map((gap) => {
      const { researcherId, ...inForce } = gap.inForce;
      return { ...gap, inForce, by: voices.researcher(researcherId) };
    }),
    analysis,
    framings: framings.map((f) => ({
      framingId: f.id,
      question: f.question,
      provision: f.provision,
      by: voices.researcher(f.researcherId),
      createdAt: f.createdAt,
    })),
    // THE TRANSCRIPT, from the one builder set. `currentFingerprint` is handed in rather than recomputed, so an
    // ANALYSIS turn's `current` and the `analysis` arm above answer from ONE fingerprint — two computations of
    // FINGERPRINT(head) in one body is the second spelling that drifts.
    history: await history(thesis.id, {
      since: input.since === undefined ? undefined : new Date(input.since),
      callerId: caller,
      currentFingerprint: analysed?.fingerprint ?? null,
    }),
  };
}

export async function getThesisContextHandler(input: GetThesisContextInput): Promise<string> {
  return answer(() => thesisContextOf(input));
}

/**
 * The analysis arm: HEAD's fingerprint through the one loader, and CURRENT_ANALYSIS called over HEAD's analyses.
 *
 * It returns the FINGERPRINT beside the state, because the transcript's ANALYSIS turns need it to say whether
 * each one is current (A4 :1476) and computing FINGERPRINT(head) twice in one answer is the second spelling
 * that drifts. `null` when the head has none — awaiting derivation is not a fingerprint.
 */
async function analysisOf(
  thesisId: string,
  headVersionId: string,
  voices: Voices,
): Promise<{ state: AnalysisState; fingerprint: string | null }> {
  const headed = await headFingerprint(thesisId, headVersionId);
  if (!headed.defined) return { state: { state: 'AWAITING_DERIVATION', name: headed.name }, fingerprint: null };

  const analyses = await prisma.thesisAnalysis.findMany({ where: { versionId: headVersionId } });
  const current = currentAnalysis(headVersionId, analyses, headed.fingerprint);
  if (current !== null) {
    return {
      state: {
        state: 'CURRENT',
        fingerprint: headed.fingerprint,
        analysisId: current.id,
        runAt: current.runAt,
        by: voices.model(current.model, current.promptVersion, current.researcherId),
        opinion: current.opinion,
      },
      fingerprint: headed.fingerprint,
    };
  }
  const latest = [...analyses].sort((a, b) => b.runAt.getTime() - a.runAt.getTime()).at(0);
  if (latest === undefined) return { state: { state: 'NONE', fingerprint: headed.fingerprint }, fingerprint: headed.fingerprint };
  return {
    state: {
      state: 'STALE',
      fingerprint: headed.fingerprint,
      latest: { analysisId: latest.id, inputFingerprint: latest.inputFingerprint, runAt: latest.runAt },
    },
    fingerprint: headed.fingerprint,
  };
}

/**
 * The LATEST of a set of dated rows — the withdrawal in force (T6 :920). Seeded with `.at(0)`, so an empty set
 * is `null` and never an unguarded index: the two debt ratchets' answer (`CLAUDE.md`).
 */
function latestOf<T extends { createdAt: Date }>(rows: readonly T[]): T | null {
  return rows.reduce<T | null>((latest, row) => (latest === null || row.createdAt > latest.createdAt ? row : latest), rows.at(0) ?? null);
}

/** One version with its mentions resolved — and the mentions as UNARGUED reads them. */
async function versionView(
  thesisId: string,
  versionId: string,
  voices: Voices,
): Promise<{ view: VersionView; cited: Parameters<typeof unargued>[1] }> {
  const version = await prisma.thesisVersion.findUnique({
    where: { id: versionId },
    select: { id: true, text: true, claim: true, contentHash: true, createdAt: true, createdById: true },
  });
  if (version === null) {
    throw new Error(`get_thesis_context: thesis ${thesisId} points at version ${versionId}, which does not exist.`);
  }
  const rows = await prisma.thesisMention.findMany({
    where: { versionId },
    select: {
      kind: true,
      name: true,
      contentVersionHash: true,
      debateSession: { select: { status: true, recordFileHash: true, thesisId: true } },
    },
  });
  const trajectoryIds = rows.filter((m) => m.kind === 'TRAJECTORY').map((m) => m.name);
  const { resolved } = await resolveTrajectoryCitations(trajectoryIds);

  const cited = rows.map((m) => ({ kind: m.kind, name: m.name, debate: m.debateSession }));
  const mentions = rows.map((m): ResolvedMention => {
    if (m.kind === 'TRAJECTORY') {
      const currency = resolved.find((t) => t.id === m.name)?.currency;
      return { kind: m.kind, name: m.name, pin: null, argued: false, ...(currency === undefined ? { resolves: false } : { resolves: true, currency }) };
    }
    return {
      kind: m.kind,
      name: m.name,
      pin: m.contentVersionHash,
      argued: argued({ name: m.name, thesisId, debate: m.debateSession }),
    };
  });

  return {
    view: {
      versionId: version.id,
      by: voices.researcher(version.createdById),
      text: version.text,
      claim: version.claim,
      contentHash: version.contentHash,
      createdAt: version.createdAt,
      mentions,
    },
    cited,
  };
}
