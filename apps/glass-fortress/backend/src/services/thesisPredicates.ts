import { createHash } from 'node:crypto';
import type { Framing, FramingRound, ThesisAnalysis, ThesisGapDecision, ThesisMention, ThesisVersion } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { argued, currentVersionOf, type ContentVersionProvenance, type RecordContent } from './evidencePredicates';
import { evaluatePublication, publishabilityOf, type PublicationAssessment } from './publicationEvaluation';
import type { TrajectoryCurrency } from './trajectoryCitation';

export { CRITIC_PROMPT_VERSION } from '../prompts/thesisCritique';

// ---------------------------------------------------------------------------
// THE THESIS LAYER'S DERIVATIONS — docs/gf-thesis-flows.md A3.
//
// ONE IMPORTABLE SYMBOL EACH, and the gate calls them rather than re-deriving
// them (A7 `one-symbol`, :1644–:1647). Thesis step 19 declares the first,
// CLAIM_FRAMED; UNARGUED, HISTORY and the gap list arrive at step 20,
// FINGERPRINT and the gap predicates at 22, TRAJECTORY_CURRENT and
// PUBLISHABLE(v) at 23, REVIEWS at 24 — `test/thesis/contract.ts` MODULES owes
// each to its step by name.
//
// EVERY PREDICATE IS COMPUTED ON READ AND NONE IS STORED (A3 :1413). CLAIM_FRAMED,
// UNARGUED, GAP_IN_FORCE, GAP_LIST, FINGERPRINT, CURRENT_ANALYSIS, GAPS_DECIDED,
// THE_CALL and THE_REQUESTS are PURE and SYNC over rows the caller loaded; HISTORY
// is a question about the database, async, and loads for itself —
// `evidencePredicates.ts`' purity rule, both arms, stated there once.
// ---------------------------------------------------------------------------

/** The rows CLAIM_FRAMED reads, as A2 shapes them. */
export interface ClaimFramedInput {
  version: { thesisId: string; claim: string };
  thesis: { id: string; provision: string | null };
  framings: readonly Pick<Framing, 'id' | 'thesisId'>[];
  rounds: readonly Pick<FramingRound, 'framingId' | 'sequence' | 'type' | 'content'>[];
}

/** What a CHOSEN round's `content` Json carries (A2 :1310). */
export interface ChosenContent {
  claim: string;
  provision: string | null;
}

/**
 * CLAIM_FRAMED(v) — thesis A3 `:1364–:1366`:
 *
 *   ∃ Framing f with f.thesisId = v.thesisId and a CHOSEN round r with
 *   r.claim = v.claim and r.provision = thesis.provision, and a round of
 *   type ASSESSED in f with sequence < r.sequence
 *
 * THE CLAIM IS COMPARED VERBATIM, AND NORMALISE IS NOT CALLED HERE. T2
 * `:451–:453`: the claim is "restated verbatim in each version's `claim` SO THAT
 * CLAIM_FRAMED CAN COMPARE", and A1 `:1247–:1250` lists NORMALISE's callers
 * exhaustively — the substring checks of T1 and T4, the gap id, the trajectory
 * probe — with this predicate absent from that list. So a claim differing by one
 * space is a claim that has not been framed, which is T1 `:332` read strictly:
 * "a claim reworded after its framing is a claim that has not been framed, and
 * the predicate says so by construction".
 *
 * BY SEQUENCE, NEVER `createdAt`. A3 says `sequence <`, and rows written in one
 * transaction share `now()` (interaction A3 :927), so time cannot order them.
 *
 * AN EXISTENTIAL OVER FRAMINGS, never "the latest framing": re-framing is a NEW
 * framing on the same thesis with the old one kept (T1 :318–:324), so a thesis
 * whose first framing chose another claim is still framed by its second.
 */
export function claimFramed(input: ClaimFramedInput): boolean {
  const attached = input.framings.filter((f) => f.thesisId === input.version.thesisId);

  return attached.some((framing) => {
    const mine = input.rounds.filter((r) => r.framingId === framing.id);
    const assessed = mine.filter((r) => r.type === 'ASSESSED');

    return mine.some((round) => {
      if (round.type !== 'CHOSEN') return false;
      const chosen = chosenContent(round.content);
      if (chosen === null) return false;
      if (chosen.claim !== input.version.claim) return false;
      if (chosen.provision !== input.thesis.provision) return false;
      // "preceded IN f by at least one FRAMING_ASSESSED" — an assessed round
      // whose sequence FOLLOWS the choice did not precede it.
      return assessed.some((a) => a.sequence < round.sequence);
    });
  });
}

/**
 * A CHOSEN round's content, or null when the stored Json is not the shape A2
 * gives it.
 *
 * A malformed round is NOT a framed claim and NOT a throw: this predicate is one
 * conjunct of the publication gate (A6 row 2), and a gate that throws on a
 * malformed row refuses to answer about every other conjunct too. `get_framing`
 * is where a malformed round is REPORTED as malformed (thesis step 19's
 * `test/thesisProvenance.test.ts`), which is the read whose job that is.
 *
 * `provision` is read as `null` when absent, so a framing chosen without one
 * matches a thesis without one — T1 and A2 both make the provision optional.
 */
export function chosenContent(content: unknown): ChosenContent | null {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return null;
  const { claim, provision } = content as Record<string, unknown>;
  if (typeof claim !== 'string') return null;
  if (provision !== undefined && provision !== null && typeof provision !== 'string') return null;
  return { claim, provision: typeof provision === 'string' ? provision : null };
}

// ---------------------------------------------------------------------------
// UNARGUED(v) — A3 :1371–:1374 · thesis step 20
// ---------------------------------------------------------------------------

/** A citation with the debate it references, loaded by the caller — as evidence's `argued` reads it. */
export type CitedMention = Pick<ThesisMention, 'kind' | 'name'> & {
  debate: { status: string; recordFileHash: string; thesisId: string } | null;
};

/**
 * UNARGUED(v) — the version's EVIDENCE citations nobody has argued for:
 *
 *   { m ∈ v.mentions : kind = EVIDENCE and (m.debateSessionId is null or NOT ARGUED(m)) }
 *
 * ARGUED IS CALLED, never re-spelled: evidence A3's predicate already requires the debate to be PROMOTED
 * for THIS record and THIS thesis, which is the second clause A3 :1373–:1374 adds. A TRAJECTORY mention is
 * never in the set — there is no argument for a trajectory.
 */
export function unargued(version: { thesisId: string }, mentions: readonly CitedMention[]): string[] {
  return mentions
    .filter((m) => m.kind === 'EVIDENCE' && !argued({ name: m.name, thesisId: version.thesisId, debate: m.debate }))
    .map((m) => m.name);
}

// ---------------------------------------------------------------------------
// GAP_IN_FORCE · GAP_LIST — A3 :1381–:1383 · thesis step 20
// ---------------------------------------------------------------------------

/** One gap of GAP_LIST: its decision in force, and what it READS as. */
export interface GapEntry {
  gapId: string;
  readsAs: ThesisGapDecision['decision'];
  inForce: ThesisGapDecision;
}

/**
 * GAP_IN_FORCE(t, gapId) — the decision with the highest SEQUENCE for (t, gapId), or none.
 *
 * By sequence, never `createdAt` and never arrival order: `sequence` is the decision log's compare-and-set
 * (`@@unique([thesisId, gapId, sequence])`), so it is the order the decisions were made in.
 */
export function gapInForce(
  decisions: readonly ThesisGapDecision[],
  thesisId: string,
  gapId: string,
): ThesisGapDecision | null {
  let latest: ThesisGapDecision | null = null;
  for (const decision of decisions) {
    if (decision.thesisId !== thesisId || decision.gapId !== gapId) continue;
    if (latest === null || decision.sequence > latest.sequence) latest = decision;
  }
  return latest;
}

/**
 * GAP_LIST(t) — every gapId with a decision, each at its GAP_IN_FORCE (CALLED); a gap in force CITED whose
 * `citedName` HEAD(t) does not mention READS AS OPEN — the citation that closed it has left the text.
 *
 * `headNames` are the names HEAD's mentions carry. The list is in the order each gap first entered it — its
 * lowest sequence, then that decision's `createdAt` (the R47 sketch, D6).
 */
export function gapList(decisions: readonly ThesisGapDecision[], thesisId: string, headNames: readonly string[]): GapEntry[] {
  const mine = decisions.filter((d) => d.thesisId === thesisId);
  const entered = [...mine].sort((a, b) => a.sequence - b.sequence || a.createdAt.getTime() - b.createdAt.getTime());
  const gapIds = [...new Set(entered.map((d) => d.gapId))];

  return gapIds.flatMap((gapId) => {
    const inForce = gapInForce(mine, thesisId, gapId);
    if (inForce === null) return [];
    const citationLeft = inForce.decision === 'CITED' && (inForce.citedName === null || !headNames.includes(inForce.citedName));
    return [{ gapId, readsAs: citationLeft ? 'OPEN' : inForce.decision, inForce }];
  });
}

// ---------------------------------------------------------------------------
// FINGERPRINT(v) · CURRENT_ANALYSIS(v) — A3 :1376–:1379 · thesis step 22
// ---------------------------------------------------------------------------

/** What FINGERPRINT reads — each cited record's content, so CURRENT is asked of `currentVersionOf`, never assumed. */
export interface FingerprintInput {
  contentHash: string;
  evidence: readonly { name: string; record: RecordContent<ContentVersionProvenance> }[];
  trajectoryIds: readonly string[];
  /** GAP_LIST(thesis) in ENTRY order, each at what it READS AS — the caller passes `readsAs` (R48 §c1). */
  gaps: readonly { gapId: string; decision: ThesisGapDecision['decision'] }[];
  promptVersion: string;
}

export type Fingerprinted =
  | { defined: true; fingerprint: string }
  | { defined: false; reason: 'AWAITING_DERIVATION'; name: string };

/** The byte that separates two parts of the layout — no part (a hash, a cuid, a decision, a version) can hold it. */
const PART = '\u0000';

/** Code-unit order — the order the layout states, never the caller's. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * FINGERPRINT(v) — what an analysis was ABOUT (A3 :1376–:1378; T4 :586–:588):
 *
 *   sha256( utf8( contentHash ‖ n ‖ CURRENT(record).hash, for each EVIDENCE mention in NAME order
 *                             ‖ m ‖ each TRAJECTORY id, deduplicated, SORTED
 *                             ‖ k ‖ gapId ‖ decision, for each GAP_LIST entry in ENTRY order
 *                             ‖ CRITIC_PROMPT_VERSION ) )          ‖ = the single byte 0x00; n, m, k in ASCII decimal
 *
 * A3 STATES THE INPUTS AND NO BYTE LAYOUT; THIS IS THE LAYOUT, STATED ONCE (R48 §c1, the R-rulings). The COUNTS
 * before each list make the SECTIONS unambiguous as well as the parts: a content hash, a capture's text hash and a
 * gap id share an alphabet, so without them the layout would be injective only by the formats' accident (R26).
 *
 * CURRENT IS CALLED — `currentVersionOf`, once per record. A record whose CURRENT is undefined makes the
 * fingerprint UNDEFINED and names it: the FIRST such record in name order, so the name is the same whatever order
 * the mentions were discovered in. PURE AND SYNC over rows the caller loaded.
 */
export function fingerprint(input: FingerprintInput): Fingerprinted {
  const evidence = [...input.evidence].sort((a, b) => byCodeUnit(a.name, b.name));

  const hashes: string[] = [];
  for (const { name, record } of evidence) {
    const current = currentVersionOf(record);
    if (!current.defined) return { defined: false, reason: 'AWAITING_DERIVATION', name };
    hashes.push(current.contentVersionHash);
  }
  const trajectoryIds = [...new Set(input.trajectoryIds)].sort(byCodeUnit);

  const parts = [
    input.contentHash,
    String(hashes.length),
    ...hashes,
    String(trajectoryIds.length),
    ...trajectoryIds,
    String(input.gaps.length),
    ...input.gaps.flatMap((gap) => [gap.gapId, gap.decision]),
    input.promptVersion,
  ];
  return { defined: true, fingerprint: `0x${createHash('sha256').update(parts.join(PART), 'utf8').digest('hex')}` };
}

/**
 * CURRENT_ANALYSIS(v) — the analysis of v whose `inputFingerprint` is FINGERPRINT(v) now, or none (A3 :1379).
 *
 * `@@unique([versionId, inputFingerprint])` says there is at most one; should the rows handed in hold two, the newest
 * `runAt` answers. None — never run, or every analysis stale — is null, which T5 reports by name (T4 :604–:606).
 */
export function currentAnalysis(
  versionId: string,
  analyses: readonly ThesisAnalysis[],
  fingerprint: string,
): ThesisAnalysis | null {
  let found: ThesisAnalysis | null = null;
  for (const analysis of analyses) {
    if (analysis.versionId !== versionId || analysis.inputFingerprint !== fingerprint) continue;
    if (found === null || analysis.runAt.getTime() > found.runAt.getTime()) found = analysis;
  }
  return found;
}

// ---------------------------------------------------------------------------
// GAPS_DECIDED · THE_CALL · THE_REQUESTS — A3 :1384, :1404–:1406 · thesis step 22
// ---------------------------------------------------------------------------

/**
 * GAPS_DECIDED(v) — no gap of GAP_LIST reads OPEN (A3 :1384), with how many it examined: an EMPTY list is decided and
 * says it examined ZERO, never nothing (A7 :1656–:1657). It READS the list GAP_LIST computed; it never re-derives it.
 */
export function gapsDecided(list: readonly GapEntry[]): { decided: boolean; examined: number } {
  return { decided: list.every((entry) => entry.readsAs !== 'OPEN'), examined: list.length };
}

/** The Json a decision in force carries for its appeal — a missing one is a malformed row, and THROWS. */
function appealOf(entry: GapEntry, field: 'callItem' | 'request'): unknown {
  const value = entry.inForce[field];
  if (value === null) {
    throw new Error(
      `thesisPredicates: gap ${entry.gapId} is in force ${entry.readsAs} with no ${field} — ` +
        '`ThesisGapDecision_fields_by_decision` makes that row impossible, so it is malformed, not an empty appeal.',
    );
  }
  return value;
}

/**
 * THE_CALL(t) — when a version is published, each gap READING CALLED, its call item; else none (A3 :1404–:1405).
 *
 * WHICH decisions the list holds is the CALLER's (the researcher's ruling, 2026-09-14): those decided at or before the
 * publication — `decisionsAtPublication` — never a gap called since, which waits for a publication act.
 */
export function theCall(published: boolean, list: readonly GapEntry[]): unknown[] {
  if (!published) return [];
  return list.filter((entry) => entry.readsAs === 'CALLED').map((entry) => appealOf(entry, 'callItem'));
}

/** THE_REQUESTS(t) — likewise, each gap READING REQUESTED, its request (A3 :1406). */
export function theRequests(published: boolean, list: readonly GapEntry[]): unknown[] {
  if (!published) return [];
  return list.filter((entry) => entry.readsAs === 'REQUESTED').map((entry) => appealOf(entry, 'request'));
}

/**
 * The decisions DECIDED AT OR BEFORE THE PUBLICATION — those whose `versionId` is the published version or an ANCESTOR
 * of it (A3 :1404 as amended 2026-09-14, the researcher's ruling). What THE_CALL and THE_REQUESTS are read over.
 *
 * THE CHAIN IS WALKED from the published version by `parentVersionId`, never inferred from dates: versions written in one
 * instant could not be ordered by time, and the chain never branches (T2 :463–:470). A parent the rows handed in do not
 * hold THROWS — a chain with a hole is a malformed load, and a silent stop would drop an ancestor's decisions.
 */
export function decisionsAtPublication(
  decisions: readonly ThesisGapDecision[],
  versions: readonly Pick<ThesisVersion, 'id' | 'parentVersionId'>[],
  publishedVersionId: string,
): ThesisGapDecision[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const chain = new Set<string>();
  let at: string | null = publishedVersionId;
  while (at !== null) {
    const version = byId.get(at);
    if (version === undefined) {
      throw new Error(`thesisPredicates: the version chain from ${publishedVersionId} names ${at}, which the rows do not hold.`);
    }
    chain.add(version.id);
    at = version.parentVersionId;
  }
  return decisions.filter((decision) => chain.has(decision.versionId));
}

// ---------------------------------------------------------------------------
// TRAJECTORY_CURRENT(m) — A3 :1386–:1388 · thesis step 23
// ---------------------------------------------------------------------------

/**
 * TRAJECTORY_CURRENT(m) — the cited computation's currency is PINNED_IS_LATEST or RECOMPUTED_AGREES; RECOMPUTED_DISAGREES
 * and NOT_FOLLOWED_BY_LATEST are STALE_TRAJECTORY (A3 :1386–:1388). PURE AND SYNC over the currency the ONE resolver,
 * `resolveTrajectoryCitations`, computed — the trajectory service's states, unchanged, never re-derived here.
 */
export function trajectoryCurrent(currency: TrajectoryCurrency): boolean {
  return currency.state === 'PINNED_IS_LATEST' || currency.state === 'RECOMPUTED_AGREES';
}

// ---------------------------------------------------------------------------
// PUBLISHABLE(v) — A3 :1390–:1396 · thesis step 23
// ---------------------------------------------------------------------------

/**
 * PUBLISHABLE(v) — every conjunct of A3 :1390–:1394, as a report: publishable, and the A6 check names that failed.
 *
 * THE FOLD OF THE ONE EVALUATION (the R49 sketch §6 R9): `evaluatePublication` loads once and CALLS each conjunct's
 * predicate; `publishabilityOf` folds the rows the gate renders from the same evaluation, so the gate and this predicate
 * cannot disagree by construction. ASYNC over a version id — a question about the database, by the purity rule
 * `evidencePredicates.ts` states once. A CALL-TIME import cycle with `publicationEvaluation` (R13), declared there.
 */
export async function publishableVersion(
  versionId: string,
  assessment: PublicationAssessment | null,
): Promise<{ publishable: boolean; failed: string[] }> {
  return publishabilityOf(await evaluatePublication(versionId, assessment));
}

// ---------------------------------------------------------------------------
// HISTORY(t) — A3 :1407, §9 :971–:984 · thesis step 20 · derived, never logged
// ---------------------------------------------------------------------------

/** A3 :1407's listing order — the tie-break after `createdAt` (R47 §6-R5). */
const HISTORY_KINDS = [
  'FRAMING',
  'FRAMING_ROUND',
  'VERSION',
  'DEBATE',
  'ANALYSIS',
  'GAP_DECISION',
  'PUBLICATION_ATTEMPT',
  'WITHDRAWAL',
  'NOTE',
] as const;

export type HistoryKind = (typeof HISTORY_KINDS)[number];

/** One act on a thesis: what kind of row, which, when, and who — since thesis step 23 every kind A2 lists records its researcher. */
export interface HistoryEntry {
  kind: HistoryKind;
  id: string;
  createdAt: Date;
  researcherId: string;
}

/**
 * HISTORY(t) — every row naming the thesis, in time order, attributed (A3 :1407):
 *
 *   framings and their rounds · versions · arguments (debates) · analyses · gap decisions ·
 *   publication attempts · withdrawals · notes
 *
 * DERIVED, NEVER LOGGED (§9 :981–:984; `thesis-no-log`): every entry is a row that already exists as
 * its own act, read back, and nothing is written to produce it. Each is attributed AS A2 RECORDS IT —
 * a debate to its opener (`researcherId`, the researcher's ruling at step 18), an analysis to WHO SPENT
 * THE CALL (A2 :1317 as amended 2026-09-14, the column since thesis step 23; its instant is `runAt`).
 *
 * A framing's rounds and its notes name the FRAMING, not the thesis; they are the thesis's history
 * because the framing is attached to it (R47 D11). ORDER: `createdAt`, then A3's listing order, then id
 * — a tie is broken the same way every time and the order is stored nowhere (R5). `since` is STRICT:
 * what happened AFTER the instant given (R6).
 */
export async function history(thesisId: string, since?: Date): Promise<HistoryEntry[]> {
  const framings = await prisma.framing.findMany({
    where: { thesisId },
    select: { id: true, researcherId: true, createdAt: true },
  });
  const framingIds = framings.map((f) => f.id);
  const versions = await prisma.thesisVersion.findMany({
    where: { thesisId },
    select: { id: true, createdById: true, createdAt: true },
  });
  const versionIds = versions.map((v) => v.id);

  const byThesis = { where: { thesisId }, select: { id: true, researcherId: true, createdAt: true } } as const;
  const [rounds, debates, analyses, gaps, attempts, withdrawals, thesisNotes, framingNotes] = [
    framingIds.length === 0
      ? []
      : await prisma.framingRound.findMany({
          where: { framingId: { in: framingIds } },
          select: { id: true, researcherId: true, createdAt: true },
        }),
    await prisma.debateSession.findMany(byThesis),
    versionIds.length === 0
      ? []
      : await prisma.thesisAnalysis.findMany({
          where: { versionId: { in: versionIds } },
          select: { id: true, researcherId: true, runAt: true },
        }),
    await prisma.thesisGapDecision.findMany(byThesis),
    await prisma.publicationAttempt.findMany(byThesis),
    await prisma.withdrawal.findMany(byThesis),
    await prisma.note.findMany(byThesis),
    framingIds.length === 0
      ? []
      : await prisma.note.findMany({
          where: { framingId: { in: framingIds } },
          select: { id: true, researcherId: true, createdAt: true },
        }),
  ];

  const attributed = (kind: HistoryKind, rows: readonly { id: string; researcherId: string; createdAt: Date }[]): HistoryEntry[] =>
    rows.map((row) => ({ kind, id: row.id, createdAt: row.createdAt, researcherId: row.researcherId }));

  const entries: HistoryEntry[] = [
    ...attributed('FRAMING', framings),
    ...attributed('FRAMING_ROUND', rounds),
    ...versions.map((v): HistoryEntry => ({ kind: 'VERSION', id: v.id, createdAt: v.createdAt, researcherId: v.createdById })),
    ...attributed('DEBATE', debates),
    ...analyses.map((a): HistoryEntry => ({ kind: 'ANALYSIS', id: a.id, createdAt: a.runAt, researcherId: a.researcherId })),
    ...attributed('GAP_DECISION', gaps),
    ...attributed('PUBLICATION_ATTEMPT', attempts),
    ...attributed('WITHDRAWAL', withdrawals),
    ...attributed('NOTE', [...thesisNotes, ...framingNotes]),
  ];

  return entries
    .filter((entry) => since === undefined || entry.createdAt.getTime() > since.getTime())
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        HISTORY_KINDS.indexOf(a.kind) - HISTORY_KINDS.indexOf(b.kind) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}
