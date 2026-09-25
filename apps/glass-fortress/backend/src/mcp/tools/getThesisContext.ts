import { z } from 'zod';
import type { Prisma, ThesisGapDecision } from '@prisma/client';
import { fingerprintOf, headFrom } from '../../services/criticMaterial';
import { currentAnalysis, gapList, reviewsOf, transcriptOf, unargued, type GapEntry, type OwedEntry } from '../../services/thesisPredicates';
import { getResearcherId } from '../../context/researcherContext';
import { publicationState, thesisState, type ThesisState } from '../../lib/thesisView';
import {
  citationsFrom,
  requireCitations,
  type DocumentCitationBase,
  type EvidenceCitation,
  type ResolvedCitations,
  type TrajectoryCitation,
} from '../../services/publishedThesis';
import { verifiedOf } from '../../services/documentStanding';
import { loadThesisRows, versionOf, type ThesisRows } from '../../services/thesisRows';
import { voicesOf, type ModelVoice, type Researcher, type Turn, type Voices } from '../../services/thesisTranscript';
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

/**
 * A citation of HEAD or PUBLISHED, RESOLVED — THE ONE CITATION SHAPE, public and gated (A4 :1476 as amended
 * 2026-09-21; T5 :811–:818 lists what a resolved citation carries).
 *
 * IT USED TO BE `{ kind, name, pin, argued }`, and that was wrong rather than merely narrow. ui §11 :410 (the
 * chip: "the record by page and date, the pin by its date, ARGUED or UNARGUED") and :413–:415 (the CITATIONS
 * tab: the record, the pin, ARGUED with "over objection" as a fact, FLAGGED) have required the record since
 * they were written, and the working view's centre is the PUBLIC thesis column CALLED — whose
 * `EvidenceCitation` requires `record`, `content`, `verified`, `flag` and `overObjection`. The old envelope
 * was read off these interfaces at R66 and so recorded the CODE's narrower sense of "resolved": an envelope
 * read off an implementation states what is SERVED, never what is OWED.
 *
 * THE TRAJECTORY ARM IS EXACTLY THE PUBLIC ONE plus the two fields every mention carries. `currency` LEFT THE
 * WIRE the same day: it had been written onto the `resolves: false` arm, where a property of a trajectory that
 * RESOLVED cannot exist, and no reader consumes a mention's currency. It remains this read's internal signal —
 * `citationsByVersion` decides `resolves` by whether the one resolver returned the pass at all, and `current`
 * from its currency — and stops there.
 */
type ResolvedMention =
  | EvidenceCitation
  | (TrajectoryCitation & { pin: null; argued: false })
  // THE DOCUMENT ARM (A4 :1476 as ruled 2026-09-25, R81 QC) — the resolver's arm with VERIFIED(d) added HERE, by the
  // one module that asks the chain (`documentStanding`), because the resolver is imported by a research act.
  | (DocumentCitationBase & { verified: boolean });

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
  /**
   * The CITED pages — the UNION of HEAD's and PUBLISHED's, deduplicated by url (A4 :1476, ruled 2026-09-21).
   *
   * It is owed for the citation CHIP's link onward and for nothing else: `ThesisText.tsx` :49 resolves each
   * chip's `pageId` by matching `citation.record.url` against this list, and the centre draws PUBLISHED one
   * toggle away (ui plan :739 (iii)), so a list covering one version loses every link on the toggle. A page
   * named here that the version on screen does not cite is harmless, because the lookup is BY URL.
   *
   * IT IS NOT §17's THE PAGES REGION, which the working view's centre does not draw — board ד2 has no such
   * region. The gated door must not take a second read for a fact its own read can carry (ui §6.1 :241).
   */
  pages: { trackedUrlId: string; url: string }[];
  /**
   * WHAT THIS THESIS OWES, AND THE ENTRIES — A4 :1476, ruled 2026-09-22 (the researcher, R71).
   *
   * THE SHAPE MIRRORS A4 :1523 DELIBERATELY: `owed` is the COUNT and `reviews` the entries, `E` being that
   * envelope's own union, so ONE NAME KEEPS ONE MEANING across the two doors — the frontend parses `owed` as a
   * number on both (`types/research.ts` :557). `{ owed: 0, reviews: [] }` is an answer, never a refusal
   * (ui §11 :406).
   *
   * IT IS A FIELD ON THIS READ AND NOT A READ, which is why ui §10 :370-:371's CLOSED LIST is untouched: the
   * working view used to take a SECOND read of `/api/research/reviews` and keep the entries naming this thesis,
   * paying a pass over EVERY thesis on the platform for one thesis's rows. The precedent is ui §6.1 :241, where
   * `list_corpus`' `page` gained `public: bool` "without a second read", and A4 :1476's own `pages` clause: the
   * gated door must not take a second read for a fact its own read can carry.
   *
   * PER-THESIS, NEVER REVIEWS(researcher). A3 :1408 scopes that predicate to theses the caller AUTHORS, and
   * ui §11 :407-:408 requires these entries on a COLLEAGUE's thesis too — so `reviewsOf` is called with the rows
   * and nothing about the caller.
   *
   * WHAT EACH ENTRY CARRIES is ui §11 :404's per-kind list, all of it free: the RECORD from the `recordsByName`
   * pass `citationsFrom` already made, `owedSince` from HEAD's `createdAt` (UNARGUED) or the trajectory currency
   * the same resolver returned (STALE_TRAJECTORY). FLAGGED's date is the CITATION SHEET's, because computing it
   * needs the evidence-side material this read does not load and `publishedAt` alone would OVERSTATE how long
   * the flag has been open.
   */
  owed: number;
  /**
   * PAIRED PER KIND, and the type says so — A4 :1476 as amended 2026-09-22 ("approve c, rule the record in"):
   * FLAGGED `{ record, owedSince: null }` · UNARGUED `{ record, owedSince }` · STALE_TRAJECTORY
   * `{ record: null, owedSince }`. Typing it as two independently nullable fields would describe four
   * combinations where the appendix names three, and an envelope that admits a shape the design does not is an
   * envelope read off an implementation.
   */
  reviews: OwedEntry[];
}

/** THE ONE FUNCTION behind the tool and `GET /api/research/theses/:id` (UI-3). */
export async function thesisContextOf(input: GetThesisContextInput): Promise<ThesisContext | Refusal<'NO_THESIS'>> {
  // ONE LOAD FOR THE WHOLE ANSWER (`services/thesisRows`, the plan's :779 clause). The state arm, the
  // fingerprint and the transcript are three readings of ONE set of rows, and reading them three times is what
  // `docs/gf-thesis-read-cost-2026-09-22.md` measured: 39 delegate calls, almost every table read twice or
  // more. Everything below is now a lookup, a filter or a CALLED predicate over `rows`.
  const rows = await loadThesisRows(input.thesisId);
  if (rows === null) {
    return refusal('NO_THESIS', `No thesis ${input.thesisId}. list_theses names the theses you can read.`);
  }
  const { thesis, versions, framings, decisions, withdrawals } = rows;
  const caller = getResearcherId();
  const voices = voicesOf(rows.handles, caller, thesis.id);

  // BOTH VERSIONS THROUGH THE ONE RESOLVER, IN ONE CALL (A4 :1476). `citationsByVersion` asks each of its
  // plurals once for the whole set, so the cost of this read does not grow with the number of citations NOR
  // with the second version; and its `pages` over these two ids IS the union the envelope owes. Calling a
  // single-version resolver twice would have paid eight reads twice over for the same answer.
  const cited = await citationsFrom(
    thesis.id,
    rows.mentions,
    [thesis.headVersionId, thesis.publishedVersionId].filter((id): id is string => id !== null),
  );
  // VERIFIED(d) FOR EVERY CITED DOCUMENT OF BOTH VERSIONS, ONCE — the chain and the bucket asked here and nowhere else.
  const verified = await verifiedOf(cited.documents);
  const head = thesis.headVersionId === null ? null : versionView(rows, thesis.headVersionId, voices, cited, verified);
  const published =
    thesis.publishedVersionId === null ? null : versionView(rows, thesis.publishedVersionId, voices, cited, verified);

  const analysed = head === null ? null : analysisOf(rows, head.view.versionId, voices, cited);
  const analysis = analysed?.state ?? ({ state: 'NONE' } as const);
  // THIS THESIS'S ENTRIES OF REVIEWS — A4 :1476, over the rows and the resolutions already in hand. The count is
  // this body's own list and never another scope's: ui §7.1 :326's `owed` counts EVERY researcher's entries at
  // `all`, which is a different question from the one this envelope answers.
  const owedHere = reviewsOf(rows, cited);

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
    history: transcriptOf(rows, {
      since: input.since === undefined ? undefined : new Date(input.since),
      callerId: caller,
      currentFingerprint: analysed?.fingerprint ?? null,
    }),
    pages: cited.pages,
    // ZERO EXTRA QUERIES (A4 :1476): FLAGGED from the `flaggedFor` answer `citationsFrom` already computed,
    // STALE_TRAJECTORY from the currency its one trajectory resolver already holds, UNARGUED from the head's own
    // mention rows — all of them loaded above for the body this read owes anyway.
    owed: owedHere.length,
    reviews: owedHere,
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
function analysisOf(
  rows: ThesisRows,
  headVersionId: string,
  voices: Voices,
  cited: ResolvedCitations,
): { state: AnalysisState; fingerprint: string | null } {
  const headed = fingerprintOf(headFrom(rows, headVersionId, cited.records));
  if (!headed.defined) return { state: { state: 'AWAITING_DERIVATION', name: headed.name }, fingerprint: null };

  // THE HEAD'S ANALYSES, FILTERED FROM THE ROWS. The loader's wave 2 reads every version's analyses for the
  // transcript's ANALYSIS turns, so asking the table again for one version's was a round trip for rows in hand.
  const analyses = rows.analyses.filter((a) => a.versionId === headVersionId);
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

/**
 * One version with its citations RESOLVED — and the mentions as UNARGUED reads them.
 *
 * NEITHER IS RE-DERIVED HERE. The citations come from `citationsByVersion`, the one resolver the public page
 * uses, so the gated body and the public body cannot disagree about what a citation says; `cited` rides the
 * same answer, so UNARGUED is still CALLED over rows this read paid for once.
 *
 * A TRAJECTORY citation gains `pin: null, argued: false` — the two fields every mention of A4 :1476 carries,
 * and the only difference between the gated arm and the public `TrajectoryCitation`.
 */
function versionView(
  rows: ThesisRows,
  versionId: string,
  voices: Voices,
  cited: ResolvedCitations,
  verified: ReadonlyMap<string, boolean>,
): { view: VersionView; cited: Parameters<typeof unargued>[1] } {
  const version = versionOf(rows, versionId);
  if (version === null) {
    throw new Error(`get_thesis_context: thesis ${rows.thesis.id} points at version ${versionId}, which does not exist.`);
  }
  const resolved = requireCitations(cited, versionId);
  const mentions = resolved.citations.map((citation): ResolvedMention => {
    if (citation.kind === 'TRAJECTORY') return { ...citation, pin: null, argued: false };
    if (citation.kind === 'DOCUMENT') {
      const isVerified = verified.get(citation.name);
      if (isVerified === undefined) {
        throw new Error(`get_thesis_context: no VERIFIED for #doc_${citation.name} — it was computed for every cited document.`);
      }
      return { ...citation, verified: isVerified };
    }
    return citation;
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
    cited: resolved.cited,
  };
}
