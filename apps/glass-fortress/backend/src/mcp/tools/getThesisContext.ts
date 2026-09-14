import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { gapList, history, unargued, type GapEntry, type HistoryEntry } from '../../services/thesisPredicates';
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
// UNARGUED, GAP_LIST AND HISTORY ARE CALLED, never re-derived here. THE ANALYSIS AT STEP 20: FINGERPRINT is
// step 22's, so CURRENT and STALE cannot be told apart yet — and no writer of an analysis exists before 22
// either. An analysis of HEAD is therefore a malformed state and THROWS (R47 §6-R15); none is `NONE`.
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
  text: string;
  claim: string;
  contentHash: string;
  createdAt: Date;
  mentions: ResolvedMention[];
}

interface ThesisContext {
  thesis: {
    thesisId: string;
    provision: string | null;
    createdById: string;
    headVersionId: string | null;
    publishedVersionId: string | null;
    publishedAt: Date | null;
    publicInterestStatement: string | null;
    createdAt: Date;
  };
  head: VersionView | null;
  published: VersionView | null;
  unargued: string[];
  gapList: GapEntry[];
  analysis: { state: 'NONE' };
  framings: { framingId: string; question: string; provision: string | null; researcherId: string; createdAt: Date }[];
  history: HistoryEntry[];
}

export async function getThesisContextHandler(input: GetThesisContextInput): Promise<string> {
  return answer(async (): Promise<ThesisContext | Refusal> => {
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

    const head = thesis.headVersionId === null ? null : await versionView(thesis.id, thesis.headVersionId);
    const published =
      thesis.publishedVersionId === null ? null : await versionView(thesis.id, thesis.publishedVersionId);

    if (head !== null) {
      const analyses = await prisma.thesisAnalysis.findMany({ where: { versionId: head.view.versionId }, select: { id: true } });
      if (analyses.length > 0) {
        throw new Error(
          `get_thesis_context: thesis ${thesis.id}'s head ${head.view.versionId} has ${String(analyses.length)} analysis ` +
            'row(s), and nothing writes an analysis before thesis step 22 — which also lands FINGERPRINT, without ' +
            'which CURRENT and STALE cannot be told apart. A malformed state, not an answer.',
        );
      }
    }

    const decisions = await prisma.thesisGapDecision.findMany({ where: { thesisId: thesis.id } });
    const framings = await prisma.framing.findMany({
      where: { thesisId: thesis.id },
      select: { id: true, question: true, provision: true, researcherId: true, createdAt: true },
    });

    return {
      thesis: {
        thesisId: thesis.id,
        provision: thesis.provision,
        createdById: thesis.createdById,
        headVersionId: thesis.headVersionId,
        publishedVersionId: thesis.publishedVersionId,
        publishedAt: thesis.publishedAt,
        publicInterestStatement: thesis.publicInterestStatement,
        createdAt: thesis.createdAt,
      },
      head: head?.view ?? null,
      published: published?.view ?? null,
      unargued: head === null ? [] : unargued({ thesisId: thesis.id }, head.cited),
      gapList: gapList(decisions, thesis.id, head?.view.mentions.map((m) => m.name) ?? []),
      analysis: { state: 'NONE' },
      framings: framings.map((f) => ({
        framingId: f.id,
        question: f.question,
        provision: f.provision,
        researcherId: f.researcherId,
        createdAt: f.createdAt,
      })),
      history: await history(thesis.id, input.since === undefined ? undefined : new Date(input.since)),
    };
  });
}

/** One version with its mentions resolved — and the mentions as UNARGUED reads them. */
async function versionView(
  thesisId: string,
  versionId: string,
): Promise<{ view: VersionView; cited: Parameters<typeof unargued>[1] }> {
  const version = await prisma.thesisVersion.findUnique({
    where: { id: versionId },
    select: { id: true, text: true, claim: true, contentHash: true, createdAt: true },
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
      text: version.text,
      claim: version.claim,
      contentHash: version.contentHash,
      createdAt: version.createdAt,
      mentions,
    },
    cited,
  };
}
