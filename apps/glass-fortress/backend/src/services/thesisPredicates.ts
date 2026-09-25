import { createHash } from 'node:crypto';
import type { Framing, FramingRound, MentionType, ThesisAnalysis, ThesisGapDecision, ThesisMention, ThesisVersion } from '@prisma/client';
import { prisma } from '../lib/prisma';
// ALIASED, because this module already imports `debateState.namedRecordOf` — TWO LOADERS, ONE NAMING RULE, each
// over the rows it holds: that one names a record from a DEBATE row's relations, this one from a ResolvedRecord.
// Two names in one file is the honest spelling; one name for two inputs is not.
import { namedRecordOf as namedRecordOfResolved, type ResolvedRecord } from './corpusReads';
import type { DocumentRecord, NamedRecord } from './evidenceReviews';
import {
  argued,
  currentVersionOf,
  flagged,
  type ContentVersionProvenance,
  type FlagReason,
  type FlagReport,
  type RecordContent,
} from './evidencePredicates';
import { namedRecordOf } from './debateState';
import { debateInputOf } from './openDebate';
import type { MentionRow, ThesisRows } from './thesisRows';
import {
  analysisTurns,
  debateTurns,
  framingTurns,
  gapTurns,
  noteTurns,
  orderTurns,
  publicationTurns,
  versionTurns,
  voicesOf,
  withdrawalTurns,
  type BuiltTurn,
  type Turn,
} from './thesisTranscript';
import { evaluatePublication, publishabilityOf, type PublicationAssessment } from './publicationEvaluation';
import { resolveTrajectoryCitations, type TrajectoryCurrency } from './trajectoryCitation';

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
// and REVIEWS are questions about the database, async, and load for themselves —
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
 * UNARGUED(v) — the version's EVIDENCE and DOCUMENT citations nobody has argued for:
 *
 *   { m ∈ v.mentions : kind ∈ { EVIDENCE, DOCUMENT } and (m.debateSessionId is null or NOT ARGUED(m)) }
 *
 * ARGUED IS CALLED, never re-spelled: evidence A3's predicate already requires the debate to be PROMOTED
 * for THIS record and THIS thesis, which is the second clause A3 :1373–:1374 adds. A TRAJECTORY mention is
 * never in the set — there is no argument for a trajectory. A DOCUMENT mention IS (document flows §6 :700, "the new
 * #doc_ mention, on T3's work-list"; A3 :1372 — ARGUED "unchanged, over CURRENT(d)"), added at document step 33.
 */
export function unargued(version: { thesisId: string }, mentions: readonly CitedMention[]): string[] {
  return mentions
    .filter((m) => m.kind !== 'TRAJECTORY' && !argued({ name: m.name, thesisId: version.thesisId, debate: m.debate }))
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
// FLAGGED · STALE_TRAJECTORY OVER ONE VERSION — A3 :1386–:1388, :1398, :1408–:1409 · thesis step 24
//
// THE TWO READINGS REVIEWS AND READINESS SHARE (the R50 sketch §a, q6): `check_publication_readiness` reports them as
// information on a published head (A6 :1610–:1612) and REVIEWS owes them — ONE function each, both callers, so the two
// surfaces cannot disagree about which citation is flagged or which trajectory is stale.
// ---------------------------------------------------------------------------

/** One EVIDENCE citation of a version that FLAGGED(m) holds for, with the arms `flagged` named. */
export interface FlaggedCitation {
  mentionId: string;
  name: string;
  reasons: FlagReason[];
}

/** FLAGGED(m) for each EVIDENCE citation of the version — `flagged` CALLED per mention, the flagged ones kept. */
export async function flaggedCitations(versionId: string): Promise<FlaggedCitation[]> {
  const mentions = await prisma.thesisMention.findMany({ where: { versionId, kind: 'EVIDENCE' }, select: { id: true, name: true } });
  const found: FlaggedCitation[] = [];
  for (const mention of mentions) {
    const report = await flagged(mention.id);
    if (report.flagged) found.push({ mentionId: mention.id, name: mention.name, reasons: report.reasons });
  }
  return found;
}

/** A version's trajectory citations the newest pass does not stand behind — and the ones no pass holds at all. */
interface StaleTrajectories {
  stale: { id: string; currency: TrajectoryCurrency }[];
  /** Returned WHOLE, never filtered: each caller says what a citation no stored pass holds means (the R50 sketch §0g). */
  missing: string[];
}

/**
 * STALE_TRAJECTORY over the version's TRAJECTORY citations: ONE call to the ONE resolver, `trajectoryCurrent` CALLED on
 * each resolved currency. A MISSING id has no currency, so it is not STALE_TRAJECTORY (A3 :1386–:1388) — and it is not
 * dropped: it comes back in `missing`.
 */
export async function staleTrajectories(versionId: string): Promise<StaleTrajectories> {
  const mentions = await prisma.thesisMention.findMany({ where: { versionId, kind: 'TRAJECTORY' }, select: { name: true } });
  const { resolved, missing } = await resolveTrajectoryCitations(mentions.map((m) => m.name));
  return {
    stale: resolved.filter((t) => !trajectoryCurrent(t.currency)).map((t) => ({ id: t.id, currency: t.currency })),
    missing,
  };
}

// ---------------------------------------------------------------------------
// REVIEWS(researcher) — A3 :1408–:1410 · thesis step 24 · computed on read, none stored (A3 :1413)
// ---------------------------------------------------------------------------

/** Which pointer of the thesis a citing version is: PUBLISHED(t) (`published: true`) or HEAD(t). */
export interface CitedOn {
  versionId: string;
  published: boolean;
}

/**
 * One thing an author owes. JSON-PLAIN BY CONSTRUCTION — strings, booleans and arrays of them — because the tool's entry
 * carries it verbatim beside the instant and the material it renders (the R50 sketch §0b). `name` is the record's name
 * (FLAGGED, UNARGUED) or the trajectory id (STALE_TRAJECTORY). ARRIVED is document plan step 32's member, by addition.
 */
export type ReviewEntry =
  | { kind: 'FLAGGED'; thesisId: string; name: string; versionId: string; mentionId: string; reasons: FlagReason[]; command: string }
  | {
      kind: 'STALE_TRAJECTORY';
      thesisId: string;
      name: string;
      citedOn: CitedOn[];
      state: TrajectoryCurrency['state'];
      command: string;
    }
  | { kind: 'UNARGUED'; thesisId: string; name: string; versionId: string; mentionId: string; command: string };

type ReviewKind = ReviewEntry['kind'];

/** A3 :1408–:1410's listing order — the tie-break the list sorts by after its instant. */
export const REVIEW_KINDS: readonly ReviewKind[] = ['FLAGGED', 'STALE_TRAJECTORY', 'UNARGUED'];

/**
 * WHOSE THESES the two lists run over — docs/gf-ui-flows.md §7.1 :320–:324 (UI-2, 2026-09-15), one name for both
 * `list_theses` and `list_thesis_reviews`: `mine`, the default — the theses the caller AUTHORS, A3 :1408's
 * REVIEWS(researcher) as written; `all`, EVERY thesis, the read view's — the same arms, one spelling, a different
 * subject set. Every command an entry carries still writes only as the author (thesis A7 :1685).
 */
export type ListScope = 'mine' | 'all';

/**
 * THE ONE COMMAND an entry owes, and the ONE builder of it (the R50 sketch §6-D9): FLAGGED and STALE_TRAJECTORY are
 * answered by a new version (T6 :871, :889; document flows :903) — re-pin, drop, or concede in the text; UNARGUED by
 * `open_debate`, which returns a debate already OPEN on the record and thesis rather than refusing (evidence A4 :1119).
 * REVIEWS holds no corpus, so it passes `record: null` and the command carries `record=…` as a placeholder, as evidence's
 * `reason=…` does; the tool passes the record the ONE resolver named, and the command pastes as written.
 */
export function reviewCommand(kind: ReviewKind, thesisId: string, headVersionId: string, record: NamedRecord | null): string {
  switch (kind) {
    case 'FLAGGED':
    case 'STALE_TRAJECTORY':
      return `add_thesis_version thesisId=${thesisId} expectedHeadVersionId=${headVersionId} claim=… text=…`;
    case 'UNARGUED':
      return `open_debate thesisId=${thesisId} record=${record === null ? '…' : JSON.stringify(debateInputOf(record))} rationale=…`;
  }
}

/**
 * WHAT `get_thesis_context` HANDS REVIEWS — the two plurals its citation resolver ALREADY called, and nothing else.
 *
 * It is spelled structurally rather than imported from `publishedThesis`, for the reason that module states of its
 * own `CitationMention` (:299-:306): a predicate module must not depend on the reader that feeds it.
 * `ResolvedCitations` satisfies this shape by construction.
 */
export interface ReviewInputs {
  /** mention id -> FLAGGED(m), from the ONE `flaggedFor` call of the read that loaded the rows. */
  flags: ReadonlyMap<string, FlagReport>;
  /** trajectory id -> the currency of the pass it pins. ABSENT is "no stored pass holds it" (A3 :1386-:1388). */
  trajectories: ReadonlyMap<string, TrajectoryCurrency>;
  /** EVIDENCE name -> the record the corpus holds, from the `recordsByName` pass the resolver already made. */
  records: ReadonlyMap<string, ResolvedRecord>;
  /** DOCUMENT commitment -> its row, from the resolver's one document read (document step 33). */
  documents: ReadonlyMap<string, { document: { commitment: string; title: string | null } }>;
}

/**
 * ONE THING OWED, AS THE GATED READ SERVES IT — A4 :1476's `E & { record, owedSince }`, **PAIRED PER KIND** and
 * ruled that way on 2026-09-22 (the researcher, R71 "approve c, rule the record in").
 *
 * THE PAIRING IS THE CONTRACT, not two independently nullable fields:
 *
 *   FLAGGED           { record, owedSince: null }   its date AND its material are the CITATION SHEET's
 *   UNARGUED          { record, owedSince }         the date is HEAD's `createdAt`
 *   STALE_TRAJECTORY  { record: null, owedSince }   a trajectory has no record — `/research`'s own shape for it
 *
 * WHY FLAGGED CARRIES NO DATE, and it is not an omission. `thesisReviews.ts` :228 computes it as
 * `later(published, earliest)`, where `earliest` folds `decision.at` (:211, `latestDecisionOf`) and
 * `material.movedAt` (:207, `movedFrom` over :202, `recordRowOf`) — the evidence-side rows this read never
 * loads, at 3-6 singular reads per flagged citation. And `publishedAt` ALONE was REFUSED (A4 :1476, the same
 * ruling): publication is a LOWER BOUND, so a card drawn from it would claim a flag had been open longer than
 * it has. A false date on a forensic surface is worse than none.
 *
 * EVERYTHING HERE IS STILL FREE: the record comes from the `recordsByName` pass the citation resolver already
 * made, and STALE's instant from the trajectory currency it already returned.
 */
export type OwedEntry =
  | (Extract<ReviewEntry, { kind: 'FLAGGED' }> & { record: NamedRecord; owedSince: null })
  | (Extract<ReviewEntry, { kind: 'UNARGUED' }> & { record: NamedRecord; owedSince: Date })
  | (Extract<ReviewEntry, { kind: 'STALE_TRAJECTORY' }> & { record: null; owedSince: Date });

/** The LATER of two instants — `thesisReviews.ts` :163's rule: an obligation begins at the later of its moments. */
const laterOf = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b);

/**
 * REVIEWS FOR ONE THESIS, OVER ROWS ALREADY LOADED — thesis A4 :1476's `owed` and `reviews`, ruled 2026-09-22.
 *
 * IT IS PER-THESIS AND CARRIES NO AUTHOR SCOPING. A3 :1408 scopes REVIEWS(researcher) to the theses the caller
 * AUTHORS; ui §11 :407-:408 requires these same entries on a COLLEAGUE's thesis, with the command labelled as the
 * author's. So this function asks nothing about who is calling — the gated read's own rule (§9 :1003, "gated from
 * the public, not from colleagues") — and every command it builds still writes only as the author (A7 :1685).
 *
 * ZERO QUERIES, WHICH IS THE WHOLE POINT (A4 :1476). FLAGGED reads the `flaggedFor` answer the citation resolver
 * already computed, STALE_TRAJECTORY the currency that same resolver already holds, UNARGUED the head's own mention
 * rows through `unargued` CALLED. A second read for any of them is the second read this field exists to delete.
 *
 * IT IS A SECOND ASSEMBLY OF A3 :1408-:1410's THREE ARMS BESIDE `reviews` BELOW, DELIBERATELY AND FOR NOW. The two
 * differ only in their SOURCE — this one over rows a single thesis's read already paid for, that one over queries a
 * cross-thesis list can afford — and the researcher ruled on 2026-09-22 that the cross-thesis read is a LATER chunk
 * (`handoffs/R71-fable-pending-work-source-2026-09-22.md` §2 rebuilds it as a domain query whose last step is this
 * same fold). Until then the two spellings are held equal BY A TEST rather than by hope: `thesis/derivations.test.ts`
 * asserts that both answer the same entries for one thesis, so a change to either that the other does not follow is
 * a red suite and not a drift.
 *
 * A TRAJECTORY NO STORED PASS HOLDS IS NOT AN OBLIGATION HERE, and `reviews` below THROWS on the same state — the
 * difference is deliberate and is `staleTrajectories`' own rule (:415, "each caller says what a citation no stored
 * pass holds means"). A4 :1476's `V` arm serves such a citation as `{ kind: 'TRAJECTORY', resolves: false }`, so
 * this read already draws it, on the page, in the same body; a read whose envelope admits a state cannot throw on
 * it. REVIEWS as a LIST has no such page, which is why it refuses to report the thesis at all.
 */
export function reviewsOf(rows: ThesisRows, resolved: ReviewInputs): OwedEntry[] {
  const thesisId = rows.thesis.id;
  const head = rows.thesis.headVersionId;
  if (head === null) {
    // The same loud guard `reviews` states: `create_thesis` writes the thesis, its first version and the head in
    // ONE transaction, so a thesis without one is malformed rather than unowing.
    throw new Error(`reviewsOf: thesis ${thesisId} has no head version — a malformed thesis, not an obligation.`);
  }
  const published = rows.thesis.publishedVersionId;
  const command = (kind: ReviewKind): string => reviewCommand(kind, thesisId, head, null);
  // `thesisRows.mentionsOf`, NOT IMPORTED: a value import of that module here would close a runtime cycle
  // (thesisPredicates -> thesisRows -> publishedThesis -> thesisPredicates), and this module's dependency on the
  // loader is a TYPE and stays one.
  const mentionsOn = (versionId: string): MentionRow[] => rows.mentions.filter((m) => m.versionId === versionId);
  const headVersion = rows.versions.find((v) => v.id === head);
  if (headVersion === undefined) {
    throw new Error(`reviewsOf: thesis ${thesisId} points at head ${head}, which is not among its versions.`);
  }
  // THE TWO INSTANTS THE ARMS READ. The loud guard is `thesisReviews.ts` :156-:161's: a thesis with a PUBLISHED
  // pointer has a `publishedAt`, or the row is malformed and an entry dated from it would be a guess.
  const headCreatedAt = headVersion.createdAt;
  const publishedAtOf = (kind: ReviewKind, name: string): Date => {
    const at = rows.thesis.publishedAt;
    if (at === null) {
      throw new Error(`reviewsOf: ${kind} ${name} is owed on the PUBLISHED version of ${thesisId}, which has no publishedAt.`);
    }
    return at;
  };
  /** The record as evidence A1 names it — `namedRecordOf` CALLED over the pass the citation resolver already made. */
  const recordOf = (name: string, mentionId: string, kind: MentionType): NamedRecord => {
    if (kind === 'DOCUMENT') {
      const cited = resolved.documents.get(name);
      if (cited === undefined) {
        throw new Error(`reviewsOf: mention ${mentionId} cites #doc_${name}, which the resolver of this read did not resolve.`);
      }
      // THE RECORD AS A READ ANSWERS IT — `{ commitment, title }`, one shape (R81 QB).
      const record: DocumentRecord = { commitment: cited.document.commitment, title: cited.document.title };
      return record;
    }
    const found = resolved.records.get(name);
    if (found === undefined) {
      throw new Error(`reviewsOf: mention ${mentionId} cites #ev_${name}, which the resolver of this read did not resolve.`);
    }
    return namedRecordOfResolved(found);
  };

  const entries: OwedEntry[] = [];

  if (published !== null) {
    for (const mention of mentionsOn(published).filter((m) => m.kind === 'EVIDENCE')) {
      const report = resolved.flags.get(mention.id);
      if (report === undefined) {
        throw new Error(`reviewsOf: no FLAGGED for the citation ${mention.id} — the resolver answers for every EVIDENCE mention it was handed.`);
      }
      if (!report.flagged) continue;
      entries.push({
        kind: 'FLAGGED',
        thesisId,
        name: mention.name,
        versionId: published,
        mentionId: mention.id,
        reasons: report.reasons,
        command: command('FLAGGED'),
        record: recordOf(mention.name, mention.id, mention.kind),
        owedSince: null,
      });
    }
  }

  // THE POINTERS A TRAJECTORY CAN BE CITED ON, and ONE entry per trajectory whichever cite it (A3 :1408-:1409) —
  // where PUBLISHED and HEAD are the same version it is named once, as PUBLISHED.
  const pointers: CitedOn[] =
    published === null
      ? [{ versionId: head, published: false }]
      : published === head
        ? [{ versionId: published, published: true }]
        : [
            { versionId: published, published: true },
            { versionId: head, published: false },
          ];
  const stale = new Map<string, { citedOn: CitedOn[]; state: TrajectoryCurrency['state']; latestComputedAt: string }>();
  for (const pointer of pointers) {
    for (const mention of mentionsOn(pointer.versionId).filter((m) => m.kind === 'TRAJECTORY')) {
      const currency = resolved.trajectories.get(mention.name);
      if (currency === undefined || trajectoryCurrent(currency)) continue;
      // A LOUD GUARD, the one `thesisReviews.ts` :247-:252 states: every state `trajectoryCurrent` calls STALE —
      // RECOMPUTED_DISAGREES and NOT_FOLLOWED_BY_LATEST — carries the newer pass's instant, so a stale citation
      // without one is a currency the resolver did not build.
      if (!('latestComputedAt' in currency)) {
        throw new Error(`reviewsOf: trajectory ${mention.name} on thesis ${thesisId} reads ${currency.state} and carries no latestComputedAt.`);
      }
      const held = stale.get(mention.name);
      if (held === undefined) stale.set(mention.name, { citedOn: [pointer], state: currency.state, latestComputedAt: currency.latestComputedAt });
      else held.citedOn.push(pointer);
    }
  }
  for (const [id, { citedOn, state, latestComputedAt }] of stale) {
    // THE CITING INSTANT, `thesisReviews.ts` :253-:256: the PUBLISHED pointer from its publication, HEAD from its
    // writing — the EARLIER where both cite — and the obligation begins at the later of that and the newer pass.
    const citing = citedOn
      .map((c) => (c.published ? publishedAtOf('STALE_TRAJECTORY', id) : headCreatedAt))
      .reduce((first, moment) => (moment < first ? moment : first));
    entries.push({
      kind: 'STALE_TRAJECTORY',
      thesisId,
      name: id,
      citedOn,
      state,
      command: command('STALE_TRAJECTORY'),
      record: null,
      owedSince: laterOf(citing, new Date(latestComputedAt)),
    });
  }

  const headMentions = mentionsOn(head);
  const owed = new Set(
    unargued(
      { thesisId },
      headMentions.map((m) => ({ kind: m.kind, name: m.name, debate: m.debateSession })),
    ),
  );
  for (const mention of headMentions.filter((m) => owed.has(m.name))) {
    entries.push({
      kind: 'UNARGUED',
      thesisId,
      name: mention.name,
      versionId: head,
      mentionId: mention.id,
      command: command('UNARGUED'),
      record: recordOf(mention.name, mention.id, mention.kind),
      // An unargued HEAD citation is owed from the moment the head was written (`thesisReviews.ts` :195-:196).
      owedSince: headCreatedAt,
    });
  }

  return entries;
}

/**
 * REVIEWS(researcher) — for each thesis they AUTHOR (A3 :1361): the FLAGGED citations of PUBLISHED(t) · the
 * STALE_TRAJECTORY citations of PUBLISHED(t) and HEAD(t), ONE entry per trajectory with the pointers that cite it · the
 * UNARGUED citations of HEAD(t). Every arm CALLS its predicate — `flagged`, `trajectoryCurrent` over the ONE resolver,
 * `unargued` over `argued` — and nothing is written.
 *
 * A trajectory citation NO stored pass holds THROWS, naming the thesis and the id: it was resolved when the version was
 * written and `ClaimTrajectory` rows are never deleted, so it is a malformed citation — and an obligation quietly dropped
 * from this list is an obligation reported as none. The ORDER here is the thesis id, then A3's kinds; "oldest first" is
 * the tool's (A4 :1524).
 */
export async function reviews(researcherId: string, scope: ListScope = 'mine'): Promise<ReviewEntry[]> {
  const theses = await prisma.thesis.findMany({
    where: scope === 'mine' ? { createdById: researcherId } : {},
    select: { id: true, headVersionId: true, publishedVersionId: true },
    orderBy: { id: 'asc' },
  });

  const entries: ReviewEntry[] = [];
  for (const thesis of theses) {
    const head = thesis.headVersionId;
    if (head === null) {
      // A LOUD GUARD: `create_thesis` writes the thesis, its first version and the head in ONE transaction.
      throw new Error(`reviews: thesis ${thesis.id} has no head version — a malformed thesis, not an obligation.`);
    }
    const published = thesis.publishedVersionId;
    const command = (kind: ReviewKind): string => reviewCommand(kind, thesis.id, head, null);

    if (published !== null) {
      for (const citation of await flaggedCitations(published)) {
        entries.push({ kind: 'FLAGGED', thesisId: thesis.id, name: citation.name, versionId: published, mentionId: citation.mentionId, reasons: citation.reasons, command: command('FLAGGED') });
      }
    }

    const pointers: CitedOn[] =
      published === null
        ? [{ versionId: head, published: false }]
        : published === head
          ? [{ versionId: published, published: true }]
          : [
              { versionId: published, published: true },
              { versionId: head, published: false },
            ];
    const stale = new Map<string, { citedOn: CitedOn[]; state: TrajectoryCurrency['state'] }>();
    for (const pointer of pointers) {
      const read = await staleTrajectories(pointer.versionId);
      const missing = read.missing.at(0);
      if (missing !== undefined) {
        throw new Error(
          `reviews: thesis ${thesis.id} cites trajectory ${missing} (version ${pointer.versionId}), which no stored ` +
            'detection pass holds — a malformed citation, not an obligation.',
        );
      }
      for (const trajectory of read.stale) {
        const held = stale.get(trajectory.id);
        if (held === undefined) stale.set(trajectory.id, { citedOn: [pointer], state: trajectory.currency.state });
        else held.citedOn.push(pointer);
      }
    }
    for (const [id, { citedOn, state }] of stale) {
      entries.push({ kind: 'STALE_TRAJECTORY', thesisId: thesis.id, name: id, citedOn, state, command: command('STALE_TRAJECTORY') });
    }

    const headMentions = await prisma.thesisMention.findMany({
      where: { versionId: head },
      select: { id: true, kind: true, name: true, debateSession: { select: { status: true, recordFileHash: true, thesisId: true } } },
    });
    const owed = new Set(
      unargued(
        { thesisId: thesis.id },
        headMentions.map((m) => ({ kind: m.kind, name: m.name, debate: m.debateSession })),
      ),
    );
    for (const mention of headMentions.filter((m) => owed.has(m.name))) {
      entries.push({ kind: 'UNARGUED', thesisId: thesis.id, name: mention.name, versionId: head, mentionId: mention.id, command: command('UNARGUED') });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// HISTORY(t) — A3 :1407, §9 :971–:984 · thesis step 20 · derived, never logged
// ---------------------------------------------------------------------------

// A3 :1407's listing order used to live here as `HISTORY_KINDS`, the tie-break after `createdAt` (R47 §6-R5).
// It is GONE with the eight-kind history it ordered: the transcript's tie-break is `orderTurns`' — the thread
// STEP, then the row's own turn order, then id (A4 :1476) — and `services/thesisTranscript` owns it. Kept as a
// note and not as a constant, because a second ordering nothing calls is exactly the copy that drifts.

/**
 * HISTORY(t) — THE TRANSCRIPT (§9 :974 and A4 :1476, RULED 2026-09-20 by the researcher, R66).
 *
 * "HISTORY(t) is a TRANSCRIPT of TURNS. A turn is one thing one voice said in one step." Every stored row that
 * names the thesis is read back as one turn or several — a FramingRound is one, a PublicationAttempt is three,
 * a debate is its opening, its events and its close — each with its thread, its voice, its identifying DATUM
 * and its body.
 *
 * DERIVED, NEVER LOGGED (§9 :981–:984; `thesis-no-log`), exactly as before: every turn is a row that already
 * exists as its own act, read back, and nothing is written to produce it. What changed on 2026-09-20 is that
 * the read answers WHAT HAPPENED and not merely THAT something did — it served `{ kind, id, createdAt,
 * researcherId }` and a page could render nothing from it without a second read per row.
 *
 * THE COMPOSITION IS `services/thesisTranscript`'s, one builder per thread, and this function COMPOSES.
 * `get_framing` and `get_debate` call the same two builders for their own threads (A4 :1459; evidence :1123),
 * so three doors tell one story.
 *
 * IT LOADS NOTHING. It was the LOADER as well as the composer, and its fourteen serial awaits were a third of
 * the gated read's cost (`docs/gf-thesis-read-cost-2026-09-22.md`); every one of them is now a wave of
 * `services/thesisRows.loadThesisRows`, which the same read already pays for its state arm and its
 * fingerprint. The composition below is unchanged, turn for turn.
 *
 * A framing's rounds and its notes name the FRAMING, not the thesis; they are the thesis's history because the
 * framing is attached to it (R47 D11). `since` is STRICT: what happened AFTER the instant given (R6) — and it
 * is applied to the TURN's moment, so a publication attempt's three turns cross the boundary together.
 */
export interface HistoryOptions {
  /** STRICT: turns after this instant (R6). */
  since?: Date;
  /** Whose `mine` this is. Null for a caller with no identity — every turn then reads `mine: false`. */
  callerId?: string | null;
  /** FINGERPRINT(head) now, so an ANALYSIS turn can say whether it is CURRENT without a second read (A3 :1379). */
  currentFingerprint?: string | null;
}

export function transcriptOf(rows: ThesisRows, options: HistoryOptions = {}): Turn[] {
  const { thesis, versions, framings, rounds, debates, debateEvents, analyses, decisions, attempts, withdrawals, notes } = rows;

  // THE MENTIONS PROJECTED BACK TO THE FIVE THE CONTRACT NAMES, and this is a guard rather than tidiness.
  // A4 :1476's VERSION body is the STORED rows `{ versionId, kind, name, contentVersionHash, debateSessionId }`;
  // the loader's row is WIDER (it carries `id` and a nested `debateSession` for the citation resolver), and
  // `versionTurns` (`thesisTranscript.ts` :565) passes `version.mentions` STRAIGHT THROUGH to the wire. Handing
  // it the wide row would put a mention id and another thesis's `debateSession.thesisId` into the transcript
  // without a line of the appendix asking for either.
  const mentionRows = rows.mentions.map((m) => ({
    versionId: m.versionId,
    kind: m.kind,
    name: m.name,
    contentVersionHash: m.contentVersionHash,
    debateSessionId: m.debateSessionId,
  }));
  const versionsWithMentions = versions.map((version) => ({
    ...version,
    mentions: mentionRows.filter((m) => m.versionId === version.id),
  }));
  const debatePins = mentionRows.filter((m) => m.debateSessionId !== null);
  const handles = rows.handles;
  const voices = voicesOf(handles, options.callerId ?? null, thesis.id);

  const built: BuiltTurn[] = [
    ...framings.flatMap((framing) =>
      framingTurns(framing, rounds.filter((r) => r.framingId === framing.id), versions, voices),
    ),
    ...versionTurns(versionsWithMentions, voices),
    ...debates.flatMap((debate) =>
      debateTurns(
        {
          id: debate.id,
          researcherId: debate.researcherId,
          createdAt: debate.createdAt,
          closedAt: debate.closedAt,
          status: debate.status,
          promotedOverObjection: debate.promotedOverObjection,
          evidenceFileHash: debate.evidence?.fileHash ?? null,
          record: namedRecordOf(debate),
          pin: debatePins.find((m) => m.debateSessionId === debate.id)?.contentVersionHash ?? null,
          events: debateEvents.filter((e) => e.sessionId === debate.id),
        },
        voices,
      ),
    ),
    ...analysisTurns(analyses, options.currentFingerprint ?? null, voices),
    ...gapTurns(decisions, voices),
    ...publicationTurns(attempts, voices),
    ...withdrawalTurns(withdrawals, voices),
    ...noteTurns(notes, voices),
  ];

  const since = options.since;
  return orderTurns(since === undefined ? built : built.filter((b) => b.turn.at.getTime() > since.getTime()));
}
