import type { MentionType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { provisionTitleOf } from '../lib/provisions';
import type { ChunkSide } from '../lib/diffChunking';
import { chunksOf, heldTextKey, heldTextsFor, pairName, recordsByName, type ResolvedRecord } from './corpusReads';
import { argued, EVER_PUBLISHED, flaggedFor, verifiedFor, type FlagReport, type VerifiedReport } from './evidencePredicates';
import { documentsByCommitment, type CitedDocument } from './documentCitation';
import type { PublicationMaterial } from './publicationAssessor';
import { decisionsAtPublication, gapList, theCall, theRequests, trajectoryCurrent, type CitedMention } from './thesisPredicates';
import { resolveTrajectoryCitations, type TrajectoryCurrency } from './trajectoryCitation';
import { refusal, type Refusal } from '../mcp/tools/thesisRefusals';

// ---------------------------------------------------------------------------
// WHAT A VERSION PUBLISHES — docs/gf-thesis-flows.md T5 :795–:853, T6 :914–:918, A3 :1399–:1406 as amended, A5
// :1559–:1570; thesis step 23.
//
// ONE LOADER OF THE APPEALS. `get_whistleblower_call` answers them for the published version, and the publication
// assessor is handed them for the head AS IF IT WERE PUBLISHED (the R49 sketch §d1): one function over one version id,
// so what check 16 examined is exactly what a publication makes public.
//
// THE PUBLIC READS' BODIES (`routes/publicThesisRoutes.ts`, sketch §e4). Each reads no caller, so every reader gets the
// same bytes. What a body carries is the researcher's approved words and the corpus's mechanical facts; what it never
// carries is a model's opinion or a working row — no analysis, assessment, objection, framing round, debate, note,
// withdrawal reason, gap reason or refused rationale (T5 :826–:829; A7 :1688–:1689).
//
// "EVER PUBLISHED" IS `EVER_PUBLISHED`, the one spelling in evidence's predicate module (ruling 3(c)). A version NAMED BY
// A WITHDRAWAL is never served as text — read from the Withdrawal rows, never inferred from dates (R11, R16).
//
// It holds a client and no model; it writes nothing and opens no transaction.
// ---------------------------------------------------------------------------

/**
 * The intake instruction — the researcher's ruling of 2026-09-14 (R48 §6-R21): T4 :678's instruction verbatim, and one
 * sentence that the channel for an answer opens with the document intake, naming no URL. Visible Hebrew on a PUBLIC read.
 */
export const INTAKE =
  'שלחו את הבקשה בשמכם. ' +
  'ערוץ ההגשה של מסמכים ותשובות לפלטפורמה ייפתח עם קליטת המסמכים; עד אז הקריאה והבקשות פתוחות, ודרך ההגשה עדיין לא.';

/** THE_CALL and THE_REQUESTS over the decisions decided at or before `versionId` (the researcher's ruling, 2026-09-14). */
export async function publishedAppeals(thesisId: string, versionId: string): Promise<{ call: unknown[]; requests: unknown[] }> {
  const versions = await prisma.thesisVersion.findMany({
    where: { thesisId },
    select: { id: true, parentVersionId: true },
  });
  const decisions = await prisma.thesisGapDecision.findMany({ where: { thesisId } });
  // THE VERSION'S NAMES (R48 §6-R29). They can only turn a gap CITED → OPEN, which neither appeal reads — the call is
  // CALLED gaps, the requests REQUESTED ones — so this read is kept for `gapList`'s contract, not for the answer.
  const mentions = await prisma.thesisMention.findMany({ where: { versionId }, select: { name: true } });

  const list = gapList(
    decisionsAtPublication(decisions, versions, versionId),
    thesisId,
    mentions.map((m) => m.name),
  );
  return { call: theCall(true, list), requests: theRequests(true, list) };
}

/**
 * What the publication assessor is handed for `versionId` (the R49 sketch §d1): the claim, the provision, the text
 * VERBATIM, the appeals as they would publish with it, the TITLE of every document the version cites (R84 Q15 — published
 * with the citation, so examined for names like the text), and the rationale — and nothing of the corpus: no record is
 * resolved and no document's text is read, so a citation reaches the assessor as the name the text carries.
 */
export async function assessorMaterial(
  thesis: { id: string; provision: string | null },
  versionId: string,
  rationale: string,
): Promise<PublicationMaterial> {
  const version = await prisma.thesisVersion.findUnique({ where: { id: versionId }, select: { text: true, claim: true } });
  if (version === null) {
    throw new Error(`publishedThesis: thesis ${thesis.id} points at version ${versionId}, which does not exist.`);
  }
  const { call, requests } = await publishedAppeals(thesis.id, versionId);
  const cited = await prisma.thesisMention.findMany({ where: { versionId, kind: 'DOCUMENT' }, select: { name: true } });
  const documents = await documentsByCommitment(cited.map((m) => m.name));
  // Every document a version cites was written with a title (A2, NO_TITLE since 2026-09-23); a cited one without is a
  // pre-rule row, and it is handed as nothing rather than as an empty title the model would read as "no name here".
  const titles = cited.flatMap((m) => {
    const title = documents.get(m.name)?.document.title ?? null;
    return title === null ? [] : [title];
  });
  return { claim: version.claim, provision: thesis.provision, text: version.text, call, requests, titles, rationale };
}

// ---------------------------------------------------------------------------
// GET /api/thesis — list_theses' anonymous answer (A4 :1427)
// ---------------------------------------------------------------------------

export interface PublishedEntry {
  thesisId: string;
  claim: string;
  provision: string | null;
  publishedAt: Date | null;
  author: string;
  contentHash: string;
}

/** Every thesis with PUBLISHED(t), as A4 :1427 shapes it — identical for every caller. */
export async function publishedEntries(): Promise<PublishedEntry[]> {
  const theses = await prisma.thesis.findMany({
    where: { publishedVersionId: { not: null } },
    select: { id: true, provision: true, createdById: true, publishedVersionId: true, publishedAt: true },
  });
  const handles = await handlesOf(theses.map((t) => t.createdById));

  const entries: PublishedEntry[] = [];
  for (const thesis of theses) {
    if (thesis.publishedVersionId === null) continue;
    const version = await prisma.thesisVersion.findUnique({
      where: { id: thesis.publishedVersionId },
      select: { claim: true, contentHash: true },
    });
    if (version === null) {
      throw new Error(`publishedThesis: thesis ${thesis.id} is published at ${thesis.publishedVersionId}, which does not exist.`);
    }
    entries.push({
      thesisId: thesis.id,
      claim: version.claim,
      provision: thesis.provision,
      publishedAt: thesis.publishedAt,
      author: handleOf(handles, thesis.createdById, thesis.id),
      contentHash: version.contentHash,
    });
  }
  return entries;
}

/** The handles of these researchers, by id — one query. */
export async function handlesOf(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.researcher.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, handle: true } });
  return new Map(rows.map((r) => [r.id, r.handle]));
}

/**
 * A researcher's handle — `Researcher.handle`, the only public identifier (schema :33). A missing row is a broken foreign
 * key, and says so: never an anonymous author (R47 §6-R8).
 */
export function handleOf(handles: ReadonlyMap<string, string>, researcherId: string, thesisId: string): string {
  const handle = handles.get(researcherId);
  if (handle === undefined) {
    throw new Error(
      `publishedThesis: thesis ${thesisId} names researcher ${researcherId}, and no such researcher exists. ` +
        'A thesis cannot outlive its author row; this is a broken foreign key, not an anonymous author.',
    );
  }
  return handle;
}

// ---------------------------------------------------------------------------
// GET /api/thesis/:id and /:id/versions/:v — T5 :804–:853, T6 :914–:918, A5 :1565–:1570
// ---------------------------------------------------------------------------

/** The notice where a withdrawn page was: the date alone — never the text, never the reason (T6 :915–:916). */
interface WithdrawnNotice {
  thesisId: string;
  withdrawn: true;
  withdrawnAt: Date;
}

/** A citation as the page lists it in the history and on a version: which record, at which pin — no content. */
interface CitationRef {
  kind: string;
  name: string;
  pin: string | null;
}

export interface EvidenceCitation {
  kind: 'EVIDENCE';
  name: string;
  pin: string | null;
  record: { url: string; capture: string } | { url: string; before: string; after: string };
  /**
   * `side` NARROWED 2026-09-19 from `string`. This line is the LAST widening on the path from the walk to a
   * reader: `chunksOf` hands `pinnedContent` a narrow value and this shape widened it again on the way out,
   * so the frontend's `CitedContent` inherited `string` and its „before" comparison type-checked. The wire
   * is now the union end to end (UI plan :555).
   */
  content: { kind: 'CAPTURE'; text: string } | { kind: 'DIFF'; chunks: { side: ChunkSide; text: string }[] };
  verified: { verified: boolean; captures: { capture: string; attributed: boolean | null; anchoredHashMatchesDocumentHash: boolean }[] } | { notEvaluable: string };
  flag: { flagged: boolean; reasons: readonly string[] };
  argued: boolean;
  /** The FACT that the citation was promoted over the debate assessor's objection — never the objection (T5 :816). */
  overObjection: boolean;
}

/**
 * A DOCUMENT citation, resolved — thesis A4 :1476's DOCUMENT arm (R81 QC) WITHOUT `verified`.
 *
 * `verified` is VERIFIED(d) = RECOMPUTABLE(d) AND ANCHORED(d) (document A6 :1529), and ANCHORED(d) is a CHAIN READ
 * (A3 :1366). This module is imported by `debateState.ts`, a research act (`handlesOf`), so a chain read here would reach
 * the debate through a chain of imports (`test/researchActsReachNoChain.test.ts`). The gated read completes the arm
 * through `documentStanding.verifiedOf`, the one module that asks the chain, which no research act imports.
 * `custody` is HELD or SEALED only: a SHED document cannot be cited (the version write refuses SHED) — a cited one that
 * was shed after is FLAGGED's SHED arm, step 35's, and this resolver refuses it LOUDLY until then.
 */
export interface DocumentCitationBase {
  kind: 'DOCUMENT';
  name: string;
  pin: string;
  argued: boolean;
  title: string | null;
  custody: 'HELD' | 'SEALED';
  flag: { flagged: boolean; reasons: readonly string[] };
  overObjection: boolean;
}

export type TrajectoryCitation =
  | { kind: 'TRAJECTORY'; name: string; resolves: true; claimText: string; url: string; transitions: number; current: boolean }
  | { kind: 'TRAJECTORY'; name: string; resolves: false };

type HistoryEntry =
  | { versionId: string; contentHash: string; publishedAt: Date; citations: CitationRef[] }
  | { versionId: string; publishedAt: Date; withdrawn: true; withdrawnAt: Date };

interface ThesisPage {
  thesisId: string;
  publicInterestStatement: string | null;
  claim: string;
  provision: string | null;
  /** The provision named by its table entry (docs/gf-ui-flows.md §17 :529–:530) — the page never spells a title of its own. */
  provisionTitle: string | null;
  version: { versionId: string; text: string; contentHash: string; publishedAt: Date | null; author: string };
  citations: (EvidenceCitation | TrajectoryCitation)[];
  appeals: { call: unknown[]; requests: unknown[]; intake: string };
  rationale: string;
  overObjection: boolean;
  analysisRun: boolean;
  history: HistoryEntry[];
  /** Each cited page by its id and its url — the id is what the browser composes `/corpus?page=` from (thesis A5 :1569 as amended, UI-3). */
  pages: { trackedUrlId: string; url: string }[];
}

interface VersionBody {
  thesisId: string;
  versionId: string;
  text: string;
  contentHash: string;
  publishedAt: Date;
  citations: CitationRef[];
}

/** What every public read of one thesis starts from: the thesis, its ever-published versions, its PUBLISHED attempts, its withdrawals. */
async function publicRecordOf(thesisId: string) {
  // FOUR READS, ONE WAIT. Every one of them keys on `thesisId` — the PARAMETER — so not one needs another's
  // answer, and awaiting them in turn cost the SUM of four round trips for no reason. Measured 2026-09-21 on
  // run B: 1291 + 559 + 599 + 520 ms in a strict chain, where the wall should be ~1291.
  //
  // THE EARLY RETURNS MOVE BELOW, and they are unchanged in meaning: a thesis that does not exist and a
  // thesis with no ever-published version both still answer `null`. What changes is that the three cheap
  // reads are already in flight when we find out — which costs nothing, because a thesis with no versions is
  // not the case this page is built for.
  const [thesis, versions, attempts, withdrawals] = await Promise.all([
    prisma.thesis.findUnique({
      where: { id: thesisId },
      select: { id: true, provision: true, createdById: true, publishedVersionId: true, publishedAt: true, publicInterestStatement: true },
    }),
    prisma.thesisVersion.findMany({
      where: { thesisId, ...EVER_PUBLISHED },
      select: { id: true, text: true, claim: true, contentHash: true },
    }),
    prisma.publicationAttempt.findMany({
      where: { thesisId, outcome: 'PUBLISHED' },
      select: { versionId: true, rationale: true, verdict: true, createdAt: true },
    }),
    prisma.withdrawal.findMany({ where: { thesisId }, select: { versionId: true, createdAt: true } }),
  ]);
  if (thesis === null) return null;
  if (versions.length === 0) return null;
  // SORTED IN CODE, oldest first (E10 not needed): the double's append-only tables take no `orderBy`, and one sort here
  // is the order every body below reads.
  const byTime = <R extends { createdAt: Date }>(rows: R[]): R[] => [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { thesis, versions, attempts: byTime(attempts), withdrawals: byTime(withdrawals) };
}

/** The newest withdrawal naming `versionId` — or, with none given, the newest on the thesis. */
const newestWithdrawal = (withdrawals: readonly { versionId: string; createdAt: Date }[], versionId?: string) =>
  withdrawals.filter((w) => versionId === undefined || w.versionId === versionId).at(-1);

/** When a version was published: its PUBLISHED attempt — every ever-published version has one by EVER_PUBLISHED's definition. */
function publishedAtOf(attempts: readonly { versionId: string; createdAt: Date }[], versionId: string): Date {
  const attempt = attempts.find((a) => a.versionId === versionId);
  if (attempt === undefined) {
    throw new Error(`publishedThesis: version ${versionId} is ever published and no PUBLISHED attempt names it — a malformed read.`);
  }
  return attempt.createdAt;
}

/**
 * The citations of EVERY version named, by version id — ONE read for all of them.
 *
 * `historyOf` walks every ever-published version, and asking per version cost one query per version: a thesis
 * published five times paid five round trips for a list one `in` answers. The map has an entry for every id
 * asked for, so a version that cites nothing is an empty list rather than a missing key.
 */
async function citationRefsByVersion(versionIds: readonly string[]): Promise<Map<string, CitationRef[]>> {
  const byVersion = new Map<string, CitationRef[]>(versionIds.map((id) => [id, []]));
  if (versionIds.length === 0) return byVersion;
  const select = { versionId: true, kind: true, name: true, contentVersionHash: true } as const;
  // A SET OF ONE BY ITS KEY, as the predicates' plurals do: the same rows under the same columns, and the
  // query every single-version caller has always made.
  const only = versionIds.length === 1 ? versionIds[0] : undefined;
  const mentions =
    only === undefined
      ? await prisma.thesisMention.findMany({ where: { versionId: { in: [...versionIds] } }, select })
      : (await prisma.thesisMention.findMany({ where: { versionId: only }, select })).map((m) => ({ ...m, versionId: only }));
  for (const m of mentions) {
    byVersion.get(m.versionId)?.push({ kind: m.kind, name: m.name, pin: m.contentVersionHash });
  }
  return byVersion;
}

async function citationRefsOf(versionId: string): Promise<CitationRef[]> {
  return (await citationRefsByVersion([versionId])).get(versionId) ?? [];
}

/** One version's RESOLVED citations, and the rows UNARGUED reads — both off the one read of its mentions. */
export interface VersionCitations {
  citations: (EvidenceCitation | TrajectoryCitation | DocumentCitationBase)[];
  /**
   * The same mentions as `thesisPredicates.CitedMention`, for UNARGUED(v).
   *
   * It rides this answer rather than being read again: `unargued` is CALLED and never re-derived (A3 :1371),
   * and its input is a projection of the very rows resolved here — a second `thesisMention.findMany` for them
   * would be one more query per version for rows already in hand.
   */
  cited: CitedMention[];
}

/**
 * The mention rows this resolver reads — the shape `services/thesisRows.MentionRow` already carries.
 *
 * It is a PARAMETER rather than a query so the gated read can hand rows it has already loaded. The type is
 * spelled here, structurally, rather than imported from `thesisRows`: this module is the PUBLIC page's and
 * must not depend on the gated read's loader (the standing rule that a module holding a client depends on the
 * pure one, never the other way).
 */
export interface CitationMention {
  id: string;
  versionId: string;
  /**
   * `MentionType`, NOT A HAND-WRITTEN UNION — widened at document refactor step 28, which
   * added DOCUMENT to the enum. The union here said `'EVIDENCE' | 'TRAJECTORY'` and was a
   * SECOND SPELLING of the schema's enum that happened to agree with it while there were
   * two kinds; the compiler named this site the moment there were three, which is the
   * enumeration `anchoredCaptureHash.ts` :64-:67 describes — "a compiler's list is complete
   * and a grep's is not".
   *
   * ALL THREE ARE RESOLVED SINCE DOCUMENT STEP 33, which writes the first `#doc_` mention:
   * the DOCUMENT arm below answers the working view (thesis A4 :1476, R81 QC), and the PUBLIC
   * page refuses it by name (`publicCitations`) until step 34 builds what the public reads.
   */
  kind: MentionType;
  name: string;
  contentVersionHash: string | null;
  debateSession: { status: string; recordFileHash: string; thesisId: string; promotedOverObjection: boolean } | null;
}

/** What `citationsByVersion` answers: each version's citations, and the cited pages of the whole set. */
export interface ResolvedCitations {
  byVersion: Map<string, VersionCitations>;
  /**
   * Every EVIDENCE name asked for, resolved to the record the corpus holds — the ROWS, not a verdict.
   *
   * It rides this answer because FINGERPRINT(head) is computed over the same records (`criticMaterial.ts`
   * :102) and resolving them twice in one read walked the corpus twice. A `ResolvedRecord` is an OBSERVATION,
   * which evidence A3 :1060–:1063 permits sharing; every predicate over it is still CALLED (A3 :1413–:1414).
   */
  records: Map<string, ResolvedRecord>;
  /**
   * Every DOCUMENT commitment asked for that names a document — the ONE document read this resolver made. REVIEWS
   * names an unargued document from it (R81 QB), and the gated read computes VERIFIED(d) over it, so neither reads
   * the rows again.
   */
  documents: Map<string, CitedDocument>;
  /**
   * Every cited page of every version asked for, DEDUPLICATED BY URL — thesis A4 :1476's union.
   *
   * The gated read asks for HEAD and PUBLISHED together and gets their union for free, which is what that
   * clause requires: the working view's centre draws HEAD's text with PUBLISHED one toggle away, and BOTH
   * texts' chips resolve `pageId` from this ONE list (`ThesisText.tsx` :49, by URL), so a list covering one
   * version loses every link on the toggle. A caller asking for one version gets that version's pages.
   */
  pages: { trackedUrlId: string; url: string }[];
  /**
   * FLAGGED(m) for every EVIDENCE mention resolved here — mention id → the report, `flaggedFor`'s OWN answer.
   *
   * IT IS THE PREDICATE CALLED ONCE, NOT A CACHE OF IT. `flaggedFor` is FLAGGED's plural, exported from the
   * predicate's own module (evidence A7 :1302-:1303), and this read calls it exactly once for the whole set; what
   * rides here is that one call's answer, for the consumers of THIS read. Nothing is stored and nothing is read
   * back on a later read, which is what evidence A3 :1060-:1063 forbids — `corpusReads.ts` :522-:525 states the
   * same of itself. A second `flaggedFor` inside REVIEWS' arm would be two evaluations of ONE predicate in one
   * body, which is the cost thesis A4 :1476's "ZERO EXTRA QUERIES" names.
   */
  flags: ReadonlyMap<string, FlagReport>;
  /**
   * The currency of every TRAJECTORY citation resolved here — the id → the currency of the pass it pins.
   *
   * `resolveTrajectoryCitations` is the ONE resolver and this read already calls it; a name ABSENT from this map
   * is a citation no stored pass holds, which is the `missing` arm `thesisPredicates.staleTrajectories` returns
   * whole so each caller can say what it means (A3 :1386-:1388). The wire carries only `current: boolean` (A4
   * :1476, `currency` dropped 2026-09-21), and this is the internal signal that decided it.
   */
  trajectories: ReadonlyMap<string, TrajectoryCurrency>;
}

/**
 * THE ONE RESOLVER OF A VERSION'S CITATIONS — the public page's and the working view's alike (A4 :1476).
 *
 * It was inline in `pageOf` and SINGLE-VERSION, and the gated read needs the same resolution for HEAD and for
 * PUBLISHED. Writing a second one there would be this repository's own named defect shape — one rule, two
 * implementations — so it is lifted here and takes a SET of version ids.
 *
 * THE SET IS WHY THIS IS NOT A LOOP. Every plural below is asked ONCE for every version's names together, so
 * the number of queries does not grow with the number of citations NOR with the number of versions: two
 * versions citing twelve records cost what one citing two does. Calling a single-version resolver twice would
 * have doubled eight reads for an answer one pass gives.
 *
 * `thesisId` is ARGUED's, not the versions' — a debate argues for a record on a thesis (A3 :1373).
 */
export async function citationsByVersion(thesisId: string, versionIds: readonly string[]): Promise<ResolvedCitations> {
  const wanted = [...new Set(versionIds)];
  if (wanted.length === 0) return citationsFrom(thesisId, [], wanted);
  const mentions = await prisma.thesisMention.findMany({
    where: { versionId: { in: wanted } },
    select: {
      id: true,
      versionId: true,
      kind: true,
      name: true,
      contentVersionHash: true,
      debateSession: { select: { status: true, recordFileHash: true, thesisId: true, promotedOverObjection: true } },
    },
  });
  return citationsFrom(thesisId, mentions, wanted);
}

/**
 * THE RESOLVER ITSELF, over mention rows the caller already holds — `citationsByVersion` is this with the one
 * query in front of it.
 *
 * THE SPLIT IS WHAT REMOVES A READ, NOT A SECOND RESOLVER. The gated read loads every version's mentions once
 * (`services/thesisRows`), and asking this function to read them again was one of the duplicate reads
 * `docs/gf-thesis-read-cost-2026-09-22.md` measured. Both doors run THIS body, so there is one resolution and
 * one citation shape (A4 :1476).
 *
 * `mentions` may name versions outside `versionIds`; they are filtered here rather than by the caller, so the
 * caller cannot get the filter wrong and the loud guard below still means what it says.
 */
export async function citationsFrom(
  thesisId: string,
  allMentions: readonly CitationMention[],
  versionIds: readonly string[],
): Promise<ResolvedCitations> {
  const wanted = [...new Set(versionIds)];
  // An entry for every id asked for, so a version that cites nothing is an empty list and never a missing key.
  const byVersion = new Map<string, VersionCitations>(wanted.map((id) => [id, { citations: [], cited: [] }]));
  // url → trackedUrlId, one entry per cited page.
  const pages = new Map<string, string>();
  if (wanted.length === 0) return { byVersion, records: new Map(), documents: new Map(), pages: [], flags: new Map(), trajectories: new Map() };

  const asked = new Set(wanted);
  const mentions = allMentions.filter((m) => asked.has(m.versionId));
  const trajectoryIds = mentions.filter((m) => m.kind === 'TRAJECTORY').map((m) => m.name);
  const { resolved } = await resolveTrajectoryCitations(trajectoryIds);

  // ONE PASS FOR THE WHOLE SET, and every one of these is a PLURAL THE PREDICATE'S OWN MODULE EXPORTS — never
  // a fold written here. Evidence A7 :1302–:1303 gives each predicate one importable symbol and A6 :1219
  // forbids a caller re-deriving it; a batching helper in this file would be a second spelling of VERIFIED and
  // FLAGGED, which is what the one-symbol scan refuses. The trajectory half above has always been plural —
  // this makes the evidence half the shape its neighbour already had, ten lines away in the same loop.
  // `=== 'EVIDENCE'`, never `!== 'TRAJECTORY'`: with three kinds those stopped being the
  // same set, and "not a trajectory" would have swept a DOCUMENT mention into the evidence
  // resolver silently. Step 28 made the difference real; the explicit arm below names it.
  const evidenceMentions = mentions.filter((m) => m.kind === 'EVIDENCE');
  const names = evidenceMentions.map((m) => m.name);
  const documentMentions = mentions.filter((m) => m.kind === 'DOCUMENT');
  // SIBLINGS, NOT A SEQUENCE. None of the four reads the others' answer — they are plurals over the same name
  // sets — and awaited in turn they cost the SUM of their round trips. Only `heldTextsFor` depends on one of them
  // (it needs each record's capture id), so it alone waits. FLAGGED(m) is asked for DOCUMENT mentions too: it is
  // evidence A3's predicate over the Evidence row (document A3 :1382), CALLED, never a second spelling here.
  const [records, reports, flags, documents] = await Promise.all([
    recordsByName(names),
    verifiedFor(names),
    flaggedFor([...evidenceMentions, ...documentMentions].map((m) => m.id)),
    documentsByCommitment(documentMentions.map((m) => m.name)),
  ]);
  const held = await heldTextsFor(
    evidenceMentions.flatMap((mention) => {
      const record = records.get(mention.name);
      // Only a CAPTURE citation names a held text; a DIFF's content is its stored chunks.
      if (record?.diff !== null || mention.contentVersionHash === null) return [];
      return [{ snapshotId: captureOf(record).id, textHash: mention.contentVersionHash }];
    }),
  );

  for (const mention of mentions) {
    const entry = byVersion.get(mention.versionId);
    if (entry === undefined) {
      // A LOUD GUARD, never a silent skip: `mentions` is filtered to `wanted` above, so a row naming anything
      // else means the filter is defective — and a citation quietly dropped here is a citation the centre
      // draws as `unresolved` with nothing to say why (`CLAUDE.md`, the `requireSnapshotIdentity` pattern).
      throw new Error(`publishedThesis: mention ${mention.id} names version ${mention.versionId}, which was not asked for.`);
    }
    entry.cited.push({ kind: mention.kind, name: mention.name, debate: mention.debateSession });
    if (mention.kind === 'TRAJECTORY') {
      const t = resolved.find((r) => r.id === mention.name);
      entry.citations.push(
        t === undefined
          ? { kind: 'TRAJECTORY', name: mention.name, resolves: false }
          : { kind: 'TRAJECTORY', name: mention.name, resolves: true, claimText: t.claimText, url: t.url, transitions: t.transitions, current: trajectoryCurrent(t.currency) },
      );
      continue;
    }
    if (mention.kind === 'DOCUMENT') {
      entry.citations.push(documentCitation(thesisId, mention, documents.get(mention.name) ?? null, flags));
      continue;
    }
    const record = records.get(mention.name) ?? null;
    if (record === null) {
      throw new Error(`publishedThesis: version ${mention.versionId} cites #ev_${mention.name}, which no record of the corpus resolves.`);
    }
    pages.set(record.page.url, record.page.id);
    entry.citations.push(evidenceCitation(thesisId, mention, record, reports, flags, held));
  }

  // The map `recordsByName` answers has an entry for every name asked for, `null` where the corpus derives
  // nothing — and the loop above has already thrown on any such name, so every entry here is a record.
  const resolvedRecords = new Map<string, ResolvedRecord>();
  for (const [name, record] of records) {
    if (record !== null) resolvedRecords.set(name, record);
  }
  return {
    byVersion,
    records: resolvedRecords,
    documents,
    pages: [...pages].map(([url, trackedUrlId]) => ({ trackedUrlId, url })),
    flags,
    trajectories: new Map(resolved.map((t) => [t.id, t.currency])),
  };
}

/**
 * The entry `citationsByVersion` promises for every id it was asked for — LOUD, never an empty list silently.
 *
 * A version resolved to no citations and a version the resolver never saw are different facts, and `?? []`
 * reports the second as the first: the centre would draw a text whose every chip is `unresolved` and say
 * nothing about why. Both callers reach the map through this.
 */
export function requireCitations(resolved: ResolvedCitations, versionId: string): VersionCitations {
  const entry = resolved.byVersion.get(versionId);
  if (entry === undefined) {
    throw new Error(`publishedThesis: no citations resolved for version ${versionId}, which citationsByVersion was asked for.`);
  }
  return entry;
}

/**
 * Route 2's body (sketch §e4), decided in order: no thesis or nothing ever published → null (404, one answer for both) ·
 * the pin null with a withdrawal on record → the notice · published → the page.
 */
async function pageOf(thesisId: string): Promise<ThesisPage | WithdrawnNotice | null> {
  const loaded = await publicRecordOf(thesisId);
  if (loaded === null) return null;
  const { thesis, versions, attempts, withdrawals } = loaded;

  const pin = thesis.publishedVersionId;
  if (pin === null) {
    const notice = newestWithdrawal(withdrawals);
    if (notice === undefined) {
      // A LOUD GUARD: the pin is nulled only by `unpublish_thesis`, which writes a Withdrawal in the same transaction.
      throw new Error(`publishedThesis: thesis ${thesis.id} was published and has no pin and no withdrawal — a malformed thesis.`);
    }
    return { thesisId: thesis.id, withdrawn: true, withdrawnAt: notice.createdAt };
  }

  const version = versions.find((v) => v.id === pin);
  // THE RATIONALE AND ITS VERDICT are the PINNED version's PUBLISHED attempt's — a refused attempt's words are working state.
  const attempt = attempts.filter((a) => a.versionId === pin).at(-1);
  if (version === undefined || attempt === undefined) {
    throw new Error(`publishedThesis: thesis ${thesis.id} is pinned at ${pin} with no PUBLISHED attempt of it — a malformed thesis.`);
  }

  // FIVE INDEPENDENT READS, AWAITED TOGETHER — and the reason is measured, not stylistic.
  //
  // `publicRecordOf` above must land first: every line below needs `thesis` and `pin`. NOTHING below needs
  // anything else below it. Awaited one after another they cost the SUM of their round trips; awaited
  // together they cost the SLOWEST.
  //
  // MEASURED 2026-09-21 on run B's thesis, before this change: 20 delegate calls, 16,246 ms of database
  // time inside a 16,258 ms wall — an overlap of TWELVE MILLISECONDS, which is to say none at all. The page
  // spent its whole life waiting for one query at a time. Deployed beside the database the same shape is
  // ~2 s; from a laptop one region away it is 16–54 s, and Next's proxy cuts the socket long before it ends.
  //
  // THE LATENCY IS NOT THE DEFECT — the SEQUENCE is. A read whose wall is the sum of its parts is fast only
  // where round trips are free, and it fails the moment they are not. `historyOf` joins them: it needs
  // `versions`, `attempts` and `withdrawals`, all of which `publicRecordOf` already returned.
  const [resolvedCitations, handles, analyses, appeals, history] = await Promise.all([
    // THE ONE RESOLVER, over this page's one version — the same call the gated read makes over two.
    citationsByVersion(thesis.id, [pin]),
    handlesOf([thesis.createdById]),
    prisma.thesisAnalysis.findMany({ where: { versionId: pin }, select: { id: true } }),
    publishedAppeals(thesis.id, pin),
    historyOf(versions, attempts, withdrawals),
  ]);
  const { call, requests } = appeals;

  return {
    thesisId: thesis.id,
    publicInterestStatement: thesis.publicInterestStatement,
    claim: version.claim,
    provision: thesis.provision,
    provisionTitle: provisionTitleOf(thesis.provision),
    version: { versionId: pin, text: version.text, contentHash: version.contentHash, publishedAt: thesis.publishedAt, author: handleOf(handles, thesis.createdById, thesis.id) },
    citations: publicCitations(requireCitations(resolvedCitations, pin).citations, thesis.id),
    appeals: { call, requests, intake: INTAKE },
    rationale: attempt.rationale,
    overObjection: attempt.verdict === 'DISPUTES',
    analysisRun: analyses.length > 0,
    history,
    pages: resolvedCitations.pages,
  };
}

/**
 * The PUBLIC page's citations — a DOCUMENT citation refused LOUDLY, by name. What the public reads of a document is
 * document flows §7 :848–:860's block, step 34's; check 18 `DOCUMENT_OPENING_DECIDED` refuses publication of any head
 * citing `#doc_` until step 34 builds `decide_opening` (plan :255, R81 Q-2), so this is reachable only by a defect.
 */
function publicCitations(
  citations: readonly (EvidenceCitation | TrajectoryCitation | DocumentCitationBase)[],
  thesisId: string,
): (EvidenceCitation | TrajectoryCitation)[] {
  return citations.map((citation) => {
    if (citation.kind === 'DOCUMENT') {
      throw new Error(
        `publishedThesis: the published version of ${thesisId} cites #doc_${citation.name}. The public reading of a ` +
          'document is document refactor step 34\'s, and check 18 refuses publication before it — a defect, not a state.',
      );
    }
    return citation;
  });
}

/** Every ever-published version, oldest first; a version NAMED BY A WITHDRAWAL keeps its dates and nothing of its content (R11). */
async function historyOf(
  versions: readonly { id: string; contentHash: string }[],
  attempts: readonly { versionId: string; createdAt: Date }[],
  withdrawals: readonly { versionId: string; createdAt: Date }[],
): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];
  // ONE read for every version's citations — a withdrawn entry shows none, so only the others are asked for.
  const citing = versions.filter((version) => newestWithdrawal(withdrawals, version.id) === undefined).map((version) => version.id);
  const refs = await citationRefsByVersion(citing);
  for (const version of versions) {
    const publishedAt = publishedAtOf(attempts, version.id);
    const withdrawal = newestWithdrawal(withdrawals, version.id);
    entries.push(
      withdrawal === undefined
        ? { versionId: version.id, contentHash: version.contentHash, publishedAt, citations: refs.get(version.id) ?? [] }
        : { versionId: version.id, publishedAt, withdrawn: true, withdrawnAt: withdrawal.createdAt },
    );
  }
  return entries.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
}

/** One EVIDENCE citation resolved as T5 :812–:817 lists it, each fact from its own predicate. */
/**
 * ONE citation's shape, over answers ALREADY READ — this function makes no query at all.
 *
 * It takes the three plurals' maps rather than awaiting three singulars, which is what turns eight queries per
 * citation into none. It decides nothing differently: the pin, the record's shape, the two marks and the two
 * facts are composed exactly as before.
 */
function evidenceCitation(
  thesisId: string,
  mention: {
    id: string;
    name: string;
    contentVersionHash: string | null;
    debateSession: { status: string; recordFileHash: string; thesisId: string; promotedOverObjection: boolean } | null;
  },
  record: ResolvedRecord,
  reports: Map<string, VerifiedReport>,
  flags: Map<string, FlagReport>,
  held: Map<string, string>,
): EvidenceCitation {
  const pin = mention.contentVersionHash;
  if (pin === null) {
    throw new Error(`publishedThesis: the EVIDENCE citation ${mention.id} carries no pin — the version write computes one for every record.`);
  }
  const report = reports.get(mention.name);
  const flag = flags.get(mention.id);
  if (report === undefined || flag === undefined) {
    throw new Error(`publishedThesis: no VERIFIED or FLAGGED for the citation ${mention.id} — both maps answer for every key asked.`);
  }
  return {
    kind: 'EVIDENCE',
    name: mention.name,
    pin,
    record:
      record.diff === null
        ? { url: record.page.url, capture: captureOf(record).capture }
        : { url: record.page.url, before: record.diff.before.capture, after: record.diff.after.capture },
    content: pinnedContent(record, pin, held),
    verified: report.evaluable
      ? {
          verified: report.verified,
          captures: report.captures.map((c) => ({ capture: c.capture, attributed: c.attributed, anchoredHashMatchesDocumentHash: c.anchoredHashMatchesDocumentHash })),
        }
      : { notEvaluable: report.reason },
    flag: { flagged: flag.flagged, reasons: flag.reasons },
    argued: argued({ name: mention.name, thesisId, debate: mention.debateSession }),
    overObjection: mention.debateSession?.promotedOverObjection === true,
  };
}

/**
 * One DOCUMENT citation, over answers ALREADY READ — no query. Its name, pin and argument as an EVIDENCE citation's
 * are composed (the pin is the mention's, computed by the version write), and its title and custody from the one
 * document read. A mention naming no document, or a shed one, THROWS by name: the version write refuses both, so
 * either is a row this design does not write — the SHED arm of FLAGGED(m) is document step 35's.
 */
function documentCitation(
  thesisId: string,
  mention: {
    id: string;
    name: string;
    contentVersionHash: string | null;
    debateSession: { status: string; recordFileHash: string; thesisId: string; promotedOverObjection: boolean } | null;
  },
  cited: CitedDocument | null,
  flags: Map<string, FlagReport>,
): DocumentCitationBase {
  const pin = mention.contentVersionHash;
  if (pin === null) {
    throw new Error(`publishedThesis: the DOCUMENT citation ${mention.id} carries no pin — the version write computes one for every document.`);
  }
  if (cited === null) {
    throw new Error(`publishedThesis: the DOCUMENT citation ${mention.id} names #doc_${mention.name}, which no document holds.`);
  }
  if (cited.custody === 'NONE') {
    throw new Error(`publishedThesis: the DOCUMENT citation ${mention.id} names #doc_${mention.name}, which was SHED — FLAGGED's SHED arm is document step 35's.`);
  }
  const flag = flags.get(mention.id);
  if (flag === undefined) {
    throw new Error(`publishedThesis: no FLAGGED for the citation ${mention.id} — the map answers for every key asked.`);
  }
  return {
    kind: 'DOCUMENT',
    name: mention.name,
    pin,
    argued: argued({ name: mention.name, thesisId, debate: mention.debateSession }),
    title: cited.document.title,
    custody: cited.custody,
    flag: { flagged: flag.flagged, reasons: flag.reasons },
    overObjection: mention.debateSession?.promotedOverObjection === true,
  };
}

function captureOf(record: ResolvedRecord) {
  if (record.capture === null) {
    throw new Error(`publishedThesis: ${record.fileHash} resolved to neither a capture nor a diff (evidence A1).`);
  }
  return record.capture;
}

/**
 * The PINNED content version's computed content (T5 :813): a diff's chunks at the pin, from the versions the resolver
 * already loaded and through `chunksOf`, the one reader of stored chunks; a capture's text at the pin — the snapshot's
 * text when the pin is its current text, else the kept text version.
 */
/** The pinned content, over texts ALREADY READ — pure, so the citation path reaches no delegate. */
function pinnedContent(record: ResolvedRecord, pin: string, held: Map<string, string>): EvidenceCitation['content'] {
  const { diff } = record;
  if (diff !== null) {
    const version = diff.versions.find((v) => v.contentVersionHash === pin);
    if (version === undefined) {
      throw new Error(`publishedThesis: no content version ${pin} of the diff ${pairName(diff)} — a pin names a version the walk stored.`);
    }
    return { kind: 'DIFF', chunks: chunksOf(version.chunks, pairName(diff)).map((c) => ({ side: c.side, text: c.text })) };
  }
  const capture = captureOf(record);
  const text = held.get(heldTextKey(capture.id, pin));
  if (text === undefined) {
    throw new Error(`publishedThesis: capture ${capture.capture} holds no text at the pin ${pin} — a pin names a text the walk kept.`);
  }
  return { kind: 'CAPTURE', text };
}

/**
 * Route 3's body (sketch §e4, R11), decided in order: `v` not ever published on this thesis → null (404) · the thesis
 * withdrawn now → the thesis's notice, whatever `v` · `v` named by a withdrawal → ITS notice · else the version.
 */
async function versionPage(thesisId: string, versionId: string): Promise<VersionBody | WithdrawnNotice | null> {
  const loaded = await publicRecordOf(thesisId);
  if (loaded === null) return null;
  const { thesis, versions, attempts, withdrawals } = loaded;
  const version = versions.find((v) => v.id === versionId);
  if (version === undefined) return null;

  const notice = thesis.publishedVersionId === null ? newestWithdrawal(withdrawals) : newestWithdrawal(withdrawals, versionId);
  if (notice !== undefined) return { thesisId: thesis.id, withdrawn: true, withdrawnAt: notice.createdAt };

  return {
    thesisId: thesis.id,
    versionId: version.id,
    text: version.text,
    contentHash: version.contentHash,
    publishedAt: publishedAtOf(attempts, version.id),
    citations: await citationRefsOf(version.id),
  };
}

// ---------------------------------------------------------------------------
// THE TWO PUBLIC THESIS READS AS CORES — UI-3 (the R53 sketch §0h, round 2 M2). "A thesis never published" (docs/gf-ui-
// flows.md §6's table) is `NOT_PUBLISHED`, the thesis layer's word for "nothing is published", decided HERE and nowhere
// in a route module — the adapter's one table makes it the one 404.
// ---------------------------------------------------------------------------

const neverPublished = (thesisId: string): Refusal<'NOT_PUBLISHED'> => refusal('NOT_PUBLISHED', `No published thesis ${thesisId}.`);

/** `GET /api/thesis/:id`'s core: the page, the notice, or NOT_PUBLISHED for a thesis never published. */
export async function publishedPageOf(thesisId: string): Promise<ThesisPage | WithdrawnNotice | Refusal<'NOT_PUBLISHED'>> {
  return (await pageOf(thesisId)) ?? neverPublished(thesisId);
}

/** `GET /api/thesis/:id/versions/:v`'s core: the version, its notice, or NOT_PUBLISHED. */
export async function publishedVersionOf(thesisId: string, versionId: string): Promise<VersionBody | WithdrawnNotice | Refusal<'NOT_PUBLISHED'>> {
  return (await versionPage(thesisId, versionId)) ?? neverPublished(thesisId);
}
